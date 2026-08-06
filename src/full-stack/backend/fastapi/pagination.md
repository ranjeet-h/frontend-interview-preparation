# Pagination in FastAPI

## Detailed explanation

Pagination returns bounded list responses with limit/offset or cursor parameters and metadata. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

FastAPI pagination is typed query params plus bounded DB queries.

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

#### What pagination strategies are available in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Two main strategies: **Offset-based** (limit/offset) — `skip: int = Query(0, ge=0), limit: int = Query(10, ge=1, le=100)`. Simple, supports random page access, but degrades with large offsets (database scans skipped rows). **Cursor-based** (keyset) — `after: str | None = Query(None)`. Uses a cursor (last seen ID or timestamp) to fetch the next page. Faster for large datasets, no offset scan, but doesn't support random page access. Choose offset-based for small datasets and admin interfaces; cursor-based for large datasets and infinite scroll.
- **The Unforgettable Mental Model:** The **Book vs. the Scroll**. Offset pagination is like a book — you can jump to any page (random access), but flipping to page 500 takes time. Cursor pagination is like a scroll — you keep unrolling from where you left off (sequential), fast but can't jump ahead.
- **The Trap**: Using offset pagination for large datasets without realizing the performance degradation. OFFSET 1000000 scans and discards 1 million rows.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use offset-based pagination (limit/offset) for small datasets and admin interfaces — it supports random page access. For large datasets and infinite scroll, I use cursor-based pagination — it's faster because it doesn't scan skipped rows. I always cap the maximum limit to prevent abuse."

#### How do you implement offset-based pagination?
- **The Engine Mechanism (Why it behaves this way):** Create a pagination dependency: `def paginate(skip: int = Query(0, ge=0), limit: int = Query(10, ge=1, le=100)): return Pagination(skip=skip, limit=limit)`. Use it in endpoints: `def list_items(pagination: Pagination = Depends(paginate), db: Session = Depends(get_db)): items = db.query(Item).offset(pagination.skip).limit(pagination.limit).all(); total = db.query(Item).count(); return {"items": items, "total": total, "skip": pagination.skip, "limit": pagination.limit}`. Return metadata (total count, skip, limit) so clients can calculate page numbers and navigation.
- **The Unforgettable Mental Model:** The **Conveyor Belt**. The belt (database) has all items. You tell it: skip the first 20 (offset), take the next 10 (limit). The belt delivers exactly those 10 items.
- **The Trap**: Not capping the maximum limit. Without a cap, a client can request limit=1000000, causing memory exhaustion and slow responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a pagination dependency with skip and limit query parameters, capped at a maximum (typically 100). The endpoint applies offset and limit to the query, counts total items, and returns metadata for client navigation. I always cap the limit to prevent abuse."

#### How do you implement cursor-based pagination?
- **The Engine Mechanism (Why it behaves this way):** Use a cursor (typically an ID or timestamp) to fetch the next page: `def list_items(after: int | None = Query(None), limit: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)): query = db.query(Item).order_by(Item.id); if after: query = query.filter(Item.id > after); items = query.limit(limit + 1).all(); has_next = len(items) > limit; if has_next: items = items[:-1]; next_cursor = items[-1].id if items else None; return {"items": items, "next_cursor": next_cursor, "has_next": has_next}`. Fetch one extra item to determine if there's a next page, then remove it from the results.
- **The Unforgettable Mental Model:** The **Bookmark**. You place a bookmark (cursor) at the last item you read. Next time, you start from after the bookmark. You peek one page ahead to see if there's more to read.
- **The Trap**: Not fetching an extra item to determine has_next. Without the extra item, you can't know if there are more results without a separate count query.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cursor pagination uses a cursor (last seen ID) to fetch the next page. I query with a filter (id > cursor), limit + 1 to check for next page, and remove the extra item. I return next_cursor and has_next for client navigation. This avoids OFFSET scans and performs well for large datasets."

#### How do you return pagination metadata?
- **The Engine Mechanism (Why it behaves this way):** Return a structured response with pagination metadata: `class PaginatedResponse(BaseModel, Generic[T]): items: list[T]; total: int; skip: int; limit: int; pages: int`. Calculate `pages = ceil(total / limit)`. For cursor-based: `class CursorResponse(BaseModel, Generic[T]): items: list[T]; next_cursor: str | None; has_next: bool; has_prev: bool`. Include `has_prev` by checking if the cursor is not the first page. Use response models to ensure consistent pagination format across all list endpoints.
- **The Unforgettable Mental Model:** The **Package Label**. The items are the product. The pagination metadata is the shipping label — total weight (total), which box this is (page), how many boxes total (pages), and whether there are more boxes coming (has_next).
- **The Trap**: Inconsistent pagination formats across endpoints. Each list endpoint should return the same pagination structure. Use a generic response model.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a generic PaginatedResponse model with items, total, skip, limit, and pages. For cursor-based, I use next_cursor, has_next, and has_prev. I ensure all list endpoints return the same pagination structure — consistency makes frontend integration easier."

#### How does pagination affect database performance?
- **The Engine Mechanism (Why it behaves this way):** Offset pagination degrades with large offsets — `OFFSET 1000000 LIMIT 10` scans and discards 1 million rows. The database must count and skip each row. Cursor pagination avoids this — `WHERE id > cursor LIMIT 10` uses an index seek, fetching only the needed rows. For offset pagination with large datasets, consider: (1) **Keyset pagination** as an alternative, (2) **Caching total count** — count queries are expensive, cache the result, (3) **Approximate counts** — use `EXPLAIN` or database-specific approximate count functions. Always index the columns used for ordering and filtering.
- **The Unforgettable Mental Model:** The **Library Search**. Offset pagination is like counting every book from the beginning until you reach page 1000. Cursor pagination is like going directly to the bookmark — no counting needed.
- **The Trap**: Running count(*) on every paginated request. Count queries scan the entire table and are expensive. Cache the count or use approximate counts for large tables.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Offset pagination degrades with large offsets — the database scans and discards skipped rows. Cursor pagination avoids this with index seeks. I index ordering/filtering columns, cache total counts, and use approximate counts for large tables. For very large datasets, I prefer cursor-based pagination."

#### How do you test pagination?
- **The Engine Mechanism (Why it behaves this way):** Test pagination by: (1) Creating enough data for multiple pages, (2) Requesting each page and verifying correct items, (3) Testing edge cases: first page, last page, beyond last page, empty results, (4) Testing limit caps: request limit=1000000, verify it's capped, (5) Testing cursor pagination: verify next_cursor works, has_next is correct, no duplicate items across pages. Use TestClient with a test database seeded with known data.
- **The Unforgettable Mental Model:** The **Page Turner**. You test every page turn — first page, middle pages, last page, and what happens when you try to turn past the last page. You also test what happens when someone asks for 1000 pages at once.
- **The Trap**: Only testing the first page. Test edge cases — last page, beyond last page, empty results, and limit caps. These are where bugs hide.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test pagination by creating enough data for multiple pages and verifying each page returns correct items. I test edge cases — first page, last page, beyond last page, empty results, and limit caps. For cursor pagination, I verify next_cursor, has_next, and no duplicates across pages."

## 8. Active recall test

1. **What pagination strategies are available?**
   - **Explanation:** Offset-based (limit/offset) — simple, supports random access, degrades with large offsets. Cursor-based (keyset) — faster for large datasets, no offset scan, but no random access.

2. **How do you implement offset-based pagination?**
   - **Explanation:** Create a dependency with skip/limit query parameters (capped at max). Apply offset and limit to the query. Return items with metadata (total, skip, limit, pages).

3. **How do you implement cursor-based pagination?**
   - **Explanation:** Use a cursor (last seen ID) with WHERE id > cursor. Fetch limit + 1 to determine has_next, remove the extra item. Return next_cursor and has_next.

4. **How do you return pagination metadata?**
   - **Explanation:** Use a generic PaginatedResponse model with items, total, skip, limit, pages. For cursor-based: next_cursor, has_next, has_prev. Keep format consistent across endpoints.

5. **How does pagination affect database performance?**
   - **Explanation:** Offset degrades with large offsets (scans skipped rows). Cursor uses index seeks (fast). Index ordering/filtering columns. Cache total counts. Use approximate counts for large tables.

6. **How do you test pagination?**
   - **Explanation:** Create data for multiple pages, verify each page. Test edge cases — first/last page, beyond last, empty results, limit caps. For cursor: verify next_cursor, has_next, no duplicates.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Pagination in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Pagination in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Pagination in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
