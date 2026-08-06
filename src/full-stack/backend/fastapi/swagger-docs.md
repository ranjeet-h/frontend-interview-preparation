# FastAPI Swagger Docs

## Detailed explanation

FastAPI generates Swagger and OpenAPI docs from routes, type hints, request models, and response models. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Docs come from the same contracts as code.

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

#### How does FastAPI generate Swagger/OpenAPI documentation?
- **The Engine Mechanism (Why it behaves this way):** FastAPI automatically generates an OpenAPI schema (JSON) by introspecting route definitions, type hints, Pydantic models, and decorator parameters. Each route's path, method, parameters (path, query, body, header, cookie), request/response models, status codes, and descriptions are extracted and converted to the OpenAPI 3.1 specification. FastAPI serves this schema at `/openapi.json` and provides two UI interfaces: Swagger UI at `/docs` (interactive, with "Try it out" buttons) and ReDoc at `/redoc` (clean, readable format). The schema is generated at startup and cached — it's not regenerated per request.
- **The Unforgettable Mental Model:** The **Self-Writing Manual**. Instead of writing documentation separately and keeping it in sync with code, FastAPI reads the code itself and writes the documentation automatically. Every type hint, every route decorator, every model definition becomes part of the manual.
- **The Trap:** Assuming the docs are always accurate. If you use `response_model=None` or return raw dicts not matching your declared types, the docs will show the declared schema but the actual response may differ.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI generates OpenAPI docs automatically from route definitions, type hints, and Pydantic models. It serves the schema at /openapi.json, Swagger UI at /docs, and ReDoc at /redoc. The docs are generated at startup from the same contracts that power validation and serialization, so they stay in sync with the code."

#### What information appears in the generated OpenAPI schema?
- **The Engine Mechanism (Why it behaves this way):** The OpenAPI schema includes: (1) **Paths** — all routes with their HTTP methods, (2) **Parameters** — path, query, header, and cookie parameters with types, required status, and descriptions, (3) **Request bodies** — Pydantic model schemas with field types, constraints, and examples, (4) **Responses** — status codes with response model schemas, (5) **Security schemes** — OAuth2, API key, HTTP bearer definitions, (6) **Tags** — route groupings for organization, (7) **Servers** — base URLs, (8) **Components** — reusable schema definitions (Pydantic models are defined once and referenced). Everything comes from Python code — no separate YAML or JSON files needed.
- **The Unforgettable Mental Model:** The **X-Ray Scan**. The OpenAPI schema is an X-ray of your API — it shows every endpoint, every parameter, every data shape, and every security requirement, all derived from the living code.
- **The Trap:** Putting sensitive information in docstrings or descriptions. The OpenAPI schema is publicly accessible by default. Don't include internal implementation details, database column names, or security notes in descriptions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The OpenAPI schema includes all routes, parameters, request/response models, security schemes, and tags — all derived from Python code. Pydantic models become reusable schema components. I use descriptions and examples to make the docs useful for frontend developers, but I avoid exposing internal implementation details."

#### How do you customize the generated documentation?
- **The Engine Mechanism (Why it behaves this way):** FastAPI provides several customization points: (1) `summary` and `description` parameters on route decorators for endpoint documentation, (2) `tags` for grouping routes in the UI, (3) `response_description` for custom response descriptions, (4) `deprecated=True` to mark endpoints as deprecated, (5) `OpenAPI` customization via `app.openapi()` override or `app.openapi_tags` for tag metadata, (6) `Field(description=...)` and `Field(examples=[...])` in Pydantic models for field-level docs, (7) `JSONResponse` examples via `responses` parameter on routes. You can also disable docs in production with `docs_url=None` and `redoc_url=None`.
- **The Unforgettable Mental Model:** The **Annotated Blueprint**. The raw code is the structural blueprint. Decorator parameters and Field descriptions are the annotations that explain what each part does, why it exists, and how to use it.
- **The Trap:** Over-documenting with redundant information. Good docs explain the "why" and edge cases, not the "what" that's already obvious from type hints and field names.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I customize docs using summary, description, and tags on route decorators, plus Field(description) and Field(examples) in Pydantic models. I mark deprecated endpoints with deprecated=True. For production, I sometimes disable docs with docs_url=None to reduce surface area, though I generally keep them enabled for internal APIs."

#### Can you disable Swagger docs in production?
- **The Engine Mechanism (Why it behaves this way):** Yes — pass `docs_url=None` and `redoc_url=None` to `FastAPI()`. This disables the `/docs` and `/redoc` endpoints while keeping the `/openapi.json` schema available (unless you also set `openapi_url=None`). Disabling docs is a security consideration for public-facing APIs — the schema reveals your entire API surface, including internal endpoints, parameter names, and data models. However, for internal APIs or APIs with proper authentication, keeping docs enabled improves developer experience.
- **The Unforgettable Mental Model:** The **Store Window**. Swagger docs are like a store window display — great for showing customers what's available, but you might close the blinds at night (production) if you don't want competitors seeing your inventory.
- **The Trap:** Disabling docs but leaving `/openapi.json` accessible. The JSON schema contains all the same information. Disable both or protect the schema endpoint with authentication.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I disable docs in production for public APIs by setting docs_url=None and redoc_url=None. For internal APIs, I keep them enabled because they improve developer experience. If I disable docs, I also consider disabling openapi_url=None to prevent schema enumeration."

#### How do you add authentication to the OpenAPI schema?
- **The Engine Mechanism (Why it behaves this way):** FastAPI supports OpenAPI security schemes through `security` parameter and OAuth2/HTTP bearer utilities. Use `OAuth2PasswordBearer` to define an OAuth2 password flow scheme, which adds an "Authorize" button to Swagger UI. Use `HTTPBearer` for simple bearer token auth. Define the scheme at the app level or per-route. When a security scheme is active, Swagger UI prompts for credentials and includes them in the `Authorization` header for "Try it out" requests. Multiple schemes can be combined with `Security()` for AND/OR logic.
- **The Unforgettable Mental Model:** The **VIP List**. Security schemes tell Swagger UI which endpoints require a VIP pass (token). The "Authorize" button is the check-in desk where you present your pass, and Swagger UI attaches it to every request automatically.
- **The Trap:** Defining the security scheme but not actually enforcing it in the endpoint. The OpenAPI schema is documentation — it doesn't enforce security. You still need the dependency that validates the token.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use OAuth2PasswordBearer or HTTPBearer to define security schemes that appear in Swagger UI. This adds an Authorize button for testing. But the scheme is just documentation — I still need a dependency that validates the token on each request. The scheme and the enforcement must both exist."

#### How does FastAPI keep docs in sync with code?
- **The Engine Mechanism (Why it behaves this way):** Because FastAPI generates the OpenAPI schema from the same type hints, Pydantic models, and route decorators that power request validation and response serialization, there is a single source of truth. When you change a Pydantic model's field type, both validation and the docs update automatically. When you add a route parameter, both the parser and the docs reflect it. This eliminates the documentation drift problem where docs become outdated after code changes.
- **The Unforgettable Mental Model:** The **Live Mirror**. Traditional docs are a photograph — accurate when taken, stale immediately after. FastAPI docs are a mirror — they reflect the current state of the code in real time. Change the code, the mirror changes.
- **The Trap:** Adding manual documentation outside the code (separate Markdown files, Wiki pages) that duplicates what FastAPI generates. This creates two sources of truth that will inevitably diverge.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: FastAPI generates docs from the same type hints and models that power validation and serialization, so there's a single source of truth. I avoid maintaining separate documentation that duplicates API contracts. If I need additional docs, I add them as descriptions in the code itself, which FastAPI includes in the generated schema."

## 8. Active recall test

1. **Where does FastAPI serve its OpenAPI documentation?**
   - **Explanation:** Swagger UI at `/docs`, ReDoc at `/redoc`, and the raw OpenAPI JSON schema at `/openapi.json`. All are enabled by default.

2. **How does FastAPI generate the OpenAPI schema?**
   - **Explanation:** By introspecting route definitions, type hints, Pydantic models, and decorator parameters at startup. The schema is cached and served on demand.

3. **How do you disable Swagger docs in production?**
   - **Explanation:** Pass `docs_url=None` and `redoc_url=None` to `FastAPI()`. Also consider `openapi_url=None` to prevent schema enumeration.

4. **How do you add authentication to Swagger UI?**
   - **Explanation:** Use `OAuth2PasswordBearer` or `HTTPBearer` to define a security scheme. This adds an "Authorize" button to Swagger UI for testing authenticated endpoints.

5. **How do you add descriptions to API fields in the docs?**
   - **Explanation:** Use `Field(description="...")` in Pydantic models and `summary`/`description` parameters on route decorators.

6. **Why do FastAPI docs stay in sync with code?**
   - **Explanation:** Because the docs are generated from the same type hints, Pydantic models, and route decorators that power validation and serialization — a single source of truth.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

FastAPI Swagger Docs should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain FastAPI Swagger Docs, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define FastAPI Swagger Docs.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
