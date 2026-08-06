# Large FastAPI Project Structure

## Detailed explanation

A large FastAPI project separates API routers, schemas, services, repositories, models, dependencies, and settings. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Structure follows domain boundaries and request flow.

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

#### How should you structure a large FastAPI project?
- **The Engine Mechanism (Why it behaves this way):** A large FastAPI project separates concerns into layers: `routers/` (HTTP endpoints), `schemas/` (Pydantic models for request/response), `services/` (business logic), `repositories/` (database access), `models/` (SQLAlchemy ORM models), `dependencies/` (auth, DB sessions), and `core/` (config, security). Each layer depends only on the layer below it — routers call services, services call repositories, repositories use models. This layered architecture prevents circular imports, enables independent testing, and makes the codebase navigable.
- **The Unforgettable Mental Model:** The **Layer Cake**. Each layer has a specific job: frosting (routers) is what clients see, cake (services) is the substance, filling (repositories) connects to the database plate. Layers stack in order — you don't put frosting at the bottom.
- **The Trap:** Organizing by file type instead of domain. `all_routers/`, `all_schemas/`, `all_services/` makes it hard to find related code. Organize by domain: `items/` with its own router, schema, service, and repository.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a layered architecture — routers, schemas, services, repositories, models — organized by domain. Each layer depends only on the one below it. Routers handle HTTP, services handle business logic, repositories handle database access. This prevents circular imports and enables independent testing."

#### What is the difference between schemas, models, and services?
- **The Engine Mechanism (Why it behaves this way):** **Schemas** are Pydantic models for API input/output validation — they define the contract between client and server. **Models** are SQLAlchemy ORM classes that map to database tables — they define the data persistence layer. **Services** contain business logic — they orchestrate repositories, apply business rules, and return data that services format into schemas. Keeping these separate prevents: leaking database fields to clients (models → schemas), coupling business logic to HTTP (services → routers), and mixing validation with persistence (schemas ≠ models).
- **The Unforgettable Mental Model:** The **Translation Chain**. The client speaks API (schemas), the business speaks rules (services), the database speaks tables (models). Each translator converts between languages without mixing them.
- **The Trap:** Using the same class for schema, model, and service. This creates tight coupling — changing the database schema breaks the API, changing the API breaks business logic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Schemas are Pydantic models for API contracts. Models are ORM classes for database tables. Services contain business logic. I keep them separate — schemas for validation, models for persistence, services for business rules. This prevents coupling and allows each layer to evolve independently."

#### How do you avoid circular imports in large projects?
- **The Engine Mechanism (Why it behaves this way):** Circular imports occur when module A imports from module B and module B imports from module A. To avoid them: (1) Structure dependencies in one direction — routers → services → repositories → models, never backwards, (2) Use TYPE_CHECKING blocks for type-only imports: `from typing import TYPE_CHECKING; if TYPE_CHECKING: from app.models import User`, (3) Use string type hints for forward references: `"User"` instead of `User`, (4) Place shared types in a common module that both modules import from, not from each other.
- **The Unforgettable Mental Model:** The **One-Way Street**. Traffic (imports) flows in one direction: routers → services → repositories → models. No U-turns allowed. If two modules need each other, they both import from a third shared module.
- **The Trap:** Importing the app object from main.py in router files. This creates a circular import: main.py imports routers, routers import main.py. Routers should be self-contained.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I avoid circular imports by structuring dependencies in one direction — routers call services, services call repositories, repositories use models. For type-only needs, I use TYPE_CHECKING blocks. I never import the main app object from router files. Shared types go in a common module."

#### How do you organize dependencies in a large project?
- **The Engine Mechanism (Why it behaves this way):** Dependencies are organized by scope: `dependencies/common.py` for shared dependencies (get_db, get_current_user), `dependencies/items.py` for domain-specific dependencies (get_item_or_404), and router-level dependencies for domain-wide protections. Common dependencies are imported by all routers. Domain dependencies are imported only by their router. This prevents duplication and keeps dependencies near their usage. Dependencies that require database access import from repositories, not directly from models.
- **The Unforgettable Mental Model:** The **Tool Shed**. Common tools (get_db) are in the main shed, accessible to everyone. Domain-specific tools (get_item_or_404) are in the domain's workshop. No one duplicates tools — they share from the shed.
- **The Trap:** Defining get_db in every router file. This creates multiple session factories and makes dependency overrides harder. Define shared dependencies once in a common module.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I organize dependencies by scope — common dependencies in a shared module, domain-specific dependencies in their router's module. Shared dependencies like get_db and get_current_user are defined once and imported everywhere. This prevents duplication and makes testing easier with centralized overrides."

#### How does project structure affect testing?
- **The Engine Mechanism (Why it behaves this way):** A well-structured project enables testing at multiple levels: (1) **Unit tests** for services (business logic without HTTP or DB), (2) **Repository tests** for database queries (with test DB), (3) **Router tests** for HTTP behavior (with TestClient and dependency overrides), (4) **Integration tests** for the full app. Each layer can be tested independently because dependencies are injected, not hardcoded. Services can be tested without FastAPI, repositories without HTTP, and routers with mocked services.
- **The Unforgettable Mental Model:** The **Car Testing Lab**. Test the engine alone (unit tests), the transmission alone (repository tests), the dashboard (router tests), then the whole car (integration tests). Each test isolates one component.
- **The Trap:** Only writing integration tests. They're slow and make it hard to identify which layer caused a failure. Unit tests for services are fast and catch business logic bugs early.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Good structure enables multi-level testing — unit tests for services, repository tests for DB queries, router tests for HTTP with TestClient, and integration tests for the full app. Each layer is independently testable because dependencies are injected. I write fast unit tests for business logic and slower integration tests for end-to-end confidence."

#### How do you scale project structure as the team grows?
- **The Engine Mechanism (Why it behaves this way):** As the team grows, structure evolves: (1) **Solo** — single file or simple modules, (2) **Small team (2-5)** — domain-based routers with shared schemas and dependencies, (3) **Medium team (5-15)** — full layered architecture with CODEOWNERS for domain ownership, (4) **Large team (15+)** — separate packages or services per domain, possibly microservices. At each stage, the key is clear ownership boundaries — each domain has a designated owner or team responsible for its router, schemas, service, and repository.
- **The Unforgettable Mental Model:** The **City Planning**. A village (solo) needs no zoning. A town (small team) needs neighborhoods (domains). A city (medium team) needs zoning laws (layers) and district managers (CODEOWNERS). A metropolis (large team) needs separate municipalities (microservices).
- **The Trap:** Over-engineering structure for a small team. A 2-person project doesn't need microservices. Scale structure with team size, not with hypothetical future needs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I scale structure with team size — simple modules for solo, domain routers for small teams, full layered architecture for medium teams, and separate packages or services for large teams. The key is clear ownership boundaries. I don't over-engineer for hypothetical future needs."

## 8. Active recall test

1. **What are the main layers in a large FastAPI project?**
   - **Explanation:** Routers (HTTP endpoints), schemas (Pydantic models), services (business logic), repositories (database access), models (ORM classes), dependencies (auth, DB sessions), and core (config, security).

2. **What's the difference between schemas and models?**
   - **Explanation:** Schemas are Pydantic models for API input/output validation. Models are SQLAlchemy ORM classes for database tables. They serve different purposes and should be kept separate.

3. **How do you avoid circular imports?**
   - **Explanation:** Structure dependencies in one direction (routers → services → repositories → models). Use TYPE_CHECKING blocks for type-only imports. Place shared types in a common module.

4. **Where should shared dependencies like get_db be defined?**
   - **Explanation:** In a common module (dependencies/common.py) that all routers import. Never duplicate shared dependencies across router files.

5. **What levels of testing does good structure enable?**
   - **Explanation:** Unit tests (services), repository tests (DB queries), router tests (HTTP with TestClient), and integration tests (full app). Each layer is independently testable.

6. **How should project structure scale with team size?**
   - **Explanation:** Solo → simple modules. Small team → domain routers. Medium team → full layered architecture. Large team → separate packages or microservices. Scale with actual needs, not hypothetical ones.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Large FastAPI Project Structure should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Large FastAPI Project Structure, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Large FastAPI Project Structure.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
