# Pagination in FastAPI: Offset vs Keyset Cursors, Generic Schemas, and `fastapi-pagination`

## 1. Why This Exists — The Problem First

Your team launches an e-commerce catalog endpoint. During QA with 200 items, `GET /products?page=1&size=50` returns in 4 milliseconds. Six months later, the database grows to 3 million products. A user or price-scraping bot navigates to page 10,000 using `OFFSET 500000 LIMIT 50`. The database query suddenly takes 14 seconds. CPU spikes to 100%, database connection pools exhaust, and every other API route on the server grinds to a halt.

Why did this happen? Relational databases cannot magically jump to the 500,001st row on disk. With offset pagination, the database engine must read all 500,000 preceding rows off storage, traverse index nodes, evaluate visibility rules under MVCC, and discard all 500,000 rows just to hand you the last 50.

Even worse is the "ghost item and duplicate row" bug in high-write feeds. A user opens their social feed and views the first 10 posts (page 1). While they read, 3 new posts get published. When the user taps "Load More" (page 2, `OFFSET 10 LIMIT 10`), the entire dataset has shifted downward by 3 rows. Rows 8, 9, and 10 from page 1 have now shifted into positions 11, 12, and 13. The user sees those three posts a second time. If posts were deleted instead, items get skipped entirely and are never shown.

On top of this, developers frequently add `SELECT COUNT(*) FROM items` to calculate total pages. On large tables, `COUNT(*)` performs a full sequential scan or full index scan on every single paginated request.

Pagination exists to bound memory usage, protect database I/O, maintain deterministic API contracts, and deliver constant-time response latencies regardless of whether you are reading item #1 or item #10,000,000.

## 2. The Analogy — Make It Obvious

Imagine a library with a 1,000-page historical ledger.

**Offset Pagination is like counting every page by hand from page 1 every single time.**
If you ask the librarian for "10 pages starting from page 500", the librarian cannot jump straight to page 500. They open page 1, count "1, 2, 3, ... 500" sheets by hand, discard those 500 sheets into a scrap bin, and hand you sheets 501 to 510. If you ask for page 10,000, the librarian spends the whole afternoon counting from sheet 1 before giving you 10 sheets.

**Keyset / Cursor Pagination is like putting a physical bookmark where you stopped.**
Instead of saying "skip 500 pages", you tell the librarian: "Give me the 10 entries recorded immediately after entry timestamp `2026-08-27 10:15:00` and ledger ID `48291`." The librarian uses the ledger's indexed timeline to flip directly to that exact bookmark entry in a fraction of a second ($O(\log N)$ or $O(1)$ index seek), copies the next 10 lines, and hands you a new bookmark pointing to the last line copied. Even if 50 new entries were written at the front of the ledger while you were reading, your bookmark never shifts, drifts, or duplicates data.

## 3. How It Actually Works — The Full Explanation

Pagination in FastAPI requires coordinating three layers: the HTTP query parameters received by FastAPI, the SQL query executed against the database, and the Pydantic response envelope sent back to the client.

**1. Offset-Based Pagination ($O(N)$ Disk Traversals)**

Offset pagination splits data into fixed chunks using `page` (1-indexed) and `size` (or `skip` / `limit`).
- Formula: `offset = (page - 1) * size`
- SQL Execution:
  ```sql
  SELECT id, title, price, created_at
  FROM products
  ORDER BY created_at DESC
  LIMIT 50 OFFSET 500000;
  ```
- How PostgreSQL and MySQL process this: The storage engine scans the index or table rows starting from the beginning, counts 500,000 rows, discards them in memory, and returns rows 500,001 through 500,050. As offset $N$ increases, query time scales linearly with $N$.
- Total Count Overhead: Generating metadata like `total_pages = ceil(total / size)` requires `SELECT COUNT(*) FROM products`. In PostgreSQL, `COUNT(*)` must verify row visibility for MVCC snapshot isolation, requiring scanning every page in the table or index.
- Best used for: Internal admin dashboards with small datasets (< 100,000 rows) where users need UI controls to jump directly to arbitrary page numbers (e.g., "Jump to page 42").

**2. Keyset / Cursor-Based Pagination ($O(1)$ Index Seeks)**

Keyset pagination uses the sort key values of the last item in the current page as an anchor ("cursor") to fetch the subsequent page.
- The Cursor Structure: An opaque, URL-safe Base64 token encoding the sort key and the primary key tie-breaker (e.g., `{"created_at": "2026-08-27T10:00:00Z", "id": 14902}`).
- The SQL Execution:
  ```sql
  SELECT id, title, price, created_at
  FROM products
  WHERE (created_at, id) < ('2026-08-27 10:00:00+00', 14902)
  ORDER BY created_at DESC, id DESC
  LIMIT 51;
  ```
- Why the composite key `(created_at, id)` is required: Timestamps are not unique. Two transactions can insert rows with identical microsecond timestamps. If you query `WHERE created_at < :last_ts`, rows sharing the exact same timestamp across page boundaries are skipped. The unique primary key `id` guarantees a deterministic total ordering.
- Index Requirements: Keyset pagination requires a composite B-Tree index matching the exact sort order: `CREATE INDEX idx_products_created_id ON products (created_at DESC, id DESC)`. The database performs an index seek directly to the B-tree leaf node and reads only the requested number of rows, running in $O(1)$ constant time regardless of table depth.
- The "Fetch `Limit + 1`" Technique: Instead of running an expensive `COUNT(*)` query, the backend requests `limit + 1` records (e.g., 51 rows when `limit=50`). If 51 rows return, `has_next` is `True`. The backend trims off the 51st row, serializes the first 50 rows, and encodes the 50th row's keys into `next_cursor`. If only 50 or fewer rows return, `has_next` is `False` and `next_cursor` is `None`.

**3. Generic Pydantic Response Envelopes**

API endpoints must return a predictable, typed envelope. In modern Python and Pydantic v2, we define generic models parameterized by type variable `T`. This allows `Page[ProductRead]` and `Page[UserRead]` to share identical metadata structures while generating accurate OpenAPI schemas.

```python
from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    size: int
    has_next: bool
    next_cursor: str | None = None
```

**4. FastAPI Dependency Injection for Parameter Extraction**

Rather than declaring `page`, `size`, or `cursor` query parameters in every route handler, FastAPI uses classes with `Depends()`. A pagination dependency handles input validation, sets maximum safety bounds (e.g., `size <= 100` to prevent memory exhaustion), parses and decodes cursor strings, and handles malformed base64 input before route execution.

**5. How `fastapi-pagination` Works**

The popular open-source library `fastapi-pagination` automates envelope wrapping and query adaptation:
- It hooks into FastAPI with `add_pagination(app)`.
- It dynamically adapts SQLAlchemy `Select` statements by applying `.limit()` and `.offset()` at the database query compiler level.
- It automatically executes an optimized subquery count (`SELECT count(*) FROM (SELECT ... LIMIT ... OFFSET ...)`) or lets you switch to `cursor`-based pagination with `CursorPage`.

## 4. Real Code — See It Working

Here is a complete, production-grade implementation of both Keyset Cursor Pagination and Offset Pagination with SQLAlchemy 2.0 and Pydantic v2 in FastAPI.

**Example 1: Production-Grade Keyset / Cursor Pagination**

```python
import base64
import json
from datetime import datetime
from typing import Generic, TypeVar
from fastapi import FastAPI, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import Column, DateTime, Integer, String, Numeric, select, tuple_, desc
from sqlalchemy.orm import declarative_base
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

Base = declarative_base()

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

# 1. Pydantic Schemas
T = TypeVar("T")

class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    price: float
    created_at: datetime

class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    size: int
    has_next: bool
    next_cursor: str | None = None

# 2. Reusable Cursor Dependency
class CursorParams:
    def __init__(
        self,
        cursor: str | None = Query(
            default=None,
            description="Opaque base64 pagination cursor token"
        ),
        size: int = Query(
            default=20,
            ge=1,
            le=100,
            description="Page size limit (max 100 to prevent DoS)"
        ),
    ):
        self.size = size
        self.cursor = cursor
        self.last_created_at: datetime | None = None
        self.last_id: int | None = None

        if cursor:
            try:
                # Decode opaque base64 string into sort keys
                raw_json = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
                payload = json.loads(raw_json)
                self.last_created_at = datetime.fromisoformat(payload["created_at"])
                self.last_id = int(payload["id"])
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid pagination cursor token."
                )

def encode_cursor(created_at: datetime, item_id: int) -> str:
    """Encodes sorting keys into a URL-safe base64 opaque token."""
    payload = {
        "created_at": created_at.isoformat(),
        "id": item_id
    }
    raw_bytes = json.dumps(payload).encode("utf-8")
    return base64.urlsafe_b64encode(raw_bytes).decode("utf-8")

# 3. Route Handler with Over-fetching (Limit + 1)
app = FastAPI(title="Keyset Pagination API")

@app.get("/products/cursor", response_model=CursorPage[ProductOut])
async def list_products_cursor(
    params: CursorParams = Depends(),
    session: AsyncSession = Depends(lambda: None),  # Injected session
):
    # Query ordering must match composite index: created_at DESC, id DESC
    stmt = select(Product).order_by(desc(Product.created_at), desc(Product.id))

    # Apply keyset seek filter if cursor exists
    if params.last_created_at and params.last_id:
        stmt = stmt.where(
            tuple_(Product.created_at, Product.id) < (params.last_created_at, params.last_id)
        )

    # Fetch size + 1 to check for next page without running COUNT(*)
    stmt = stmt.limit(params.size + 1)
    result = await session.execute(stmt)
    rows = list(result.scalars().all())

    has_next = len(rows) > params.size
    items_to_return = rows[:params.size]

    next_cursor = None
    if has_next and items_to_return:
        last_item = items_to_return[-1]
        next_cursor = encode_cursor(last_item.created_at, last_item.id)

    return CursorPage(
        items=items_to_return,
        size=len(items_to_return),
        has_next=has_next,
        next_cursor=next_cursor
    )
```

**Example 2: Reusable Offset Pagination with Bounded Limits**

```python
import math
from typing import Generic, TypeVar
from fastapi import Query, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

class OffsetPage(BaseModel, Generic[T]):
    items: list[T]
    total_items: int
    page: int
    size: int
    total_pages: int

class OffsetPaginationParams:
    def __init__(
        self,
        page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
        size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    ):
        self.page = page
        self.size = size
        self.offset = (page - 1) * size

@app.get("/products/offset", response_model=OffsetPage[ProductOut])
async def list_products_offset(
    pagination: OffsetPaginationParams = Depends(),
    session: AsyncSession = Depends(lambda: None),
):
    # 1. Total count query
    count_stmt = select(func.count()).select_from(Product)
    total_count = (await session.execute(count_stmt)).scalar_one()

    # 2. Data query with OFFSET and LIMIT
    stmt = (
        select(Product)
        .order_by(desc(Product.created_at))
        .offset(pagination.offset)
        .limit(pagination.size)
    )
    result = await session.execute(stmt)
    products = result.scalars().all()

    total_pages = math.ceil(total_count / pagination.size) if total_count > 0 else 1

    return OffsetPage(
        items=list(products),
        total_items=total_count,
        page=pagination.page,
        size=pagination.size,
        total_pages=total_pages,
    )
```

**Example 3: Declarative Pagination with `fastapi-pagination`**

```python
from fastapi import FastAPI
from fastapi_pagination import Page, add_pagination, paginate
from fastapi_pagination.ext.sqlalchemy import paginate as sqlalchemy_paginate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

app = FastAPI()

@app.get("/items", response_model=Page[ProductOut])
async def get_items(session: AsyncSession = Depends(lambda: None)):
    # Automatically extracts params (page, size), executes count and chunk query
    return await sqlalchemy_paginate(session, select(Product).order_by(Product.id))

# Registers pagination dependency handlers into the FastAPI app
add_pagination(app)
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does SQL `OFFSET` degrade on large tables, and what is its time complexity?**

Offset pagination has $O(N)$ time complexity, where $N$ is the number of rows being skipped. When you run `SELECT * FROM users ORDER BY id LIMIT 20 OFFSET 1000000`, the database engine cannot mathematically jump directly to row 1,000,001. It must read the index or table blocks sequentially, iterate through 1,000,000 rows, check row visibility under transaction isolation (MVCC), and discard them before reading the requested 20 rows. At deep offsets, this creates massive disk I/O, saturates buffer cache memory, and causes multi-second query latencies.

**Q: Why is a single timestamp column not sufficient for keyset cursor pagination?**

Because timestamps are not guaranteed to be strictly unique. Multiple rows can be inserted within the exact same microsecond, especially during batch imports, bulk API operations, or high-throughput writes. If page 1 ends on an item with timestamp `2026-08-27 10:00:00.123456`, and three other items share that exact same timestamp, running `WHERE created_at < '2026-08-27 10:00:00.123456'` will skip all remaining items sharing that timestamp. You must use a composite sort key `(created_at, id)` where the primary key `id` acts as an invariant tie-breaker.

**Q: How does cursor-based pagination determine `has_next` without running a slow `COUNT(*)` query?**

By fetching `limit + 1` records from the database instead of `limit`. If the client asks for 20 items, the backend executes `LIMIT 21`. If the database returns 21 records, the backend knows another page exists (`has_next = True`), removes the 21st record from the list, encodes the 20th item's sort key into `next_cursor`, and sends the 20 items to the client. If the query returns 20 or fewer rows, `has_next = False` and `next_cursor = None`. This checks page availability in $O(1)$ time with zero extra database queries.

**Q: How should a cursor token be formatted and serialized for client consumption?**

A cursor should always be an opaque, URL-safe serialized string (typically Base64-encoded JSON or URL-encoded protobuf). Never expose raw database IDs or unencoded SQL timestamps directly as query parameters like `?last_id=500&last_created_at=2026-08-27`. Making the token opaque prevents API consumers from constructing synthetic queries, coupling client logic to internal database schemas, or tampering with internal primary key sequences. If the backend changes its internal sort algorithm or column types later, the opaque token format can be migrated without breaking API clients.

**Q: What happens if a row is inserted or deleted while a user is paginating through results?**

In offset pagination, concurrent inserts at the top of the dataset shift all subsequent rows downward. When the user requests page 2, rows they already saw on page 1 appear again as duplicates. If rows are deleted, items shift upward and get skipped. In keyset cursor pagination, the cursor holds an immutable coordinate (`created_at < X AND id < Y`). Newly inserted rows with newer timestamps appear above the cursor and do not alter the sequence of records below the cursor, guaranteeing zero duplicates and zero skipped records.

**Q: How do you handle total count queries when product requirements strictly demand offset pagination?**

If a UI demands "Page X of Y" or a numbered page bar:
1. Hard cap the maximum offset (e.g., refuse requests beyond page 100 with HTTP 400).
2. Cache the `COUNT(*)` result in Redis with a 5-to-15 minute TTL so thousands of concurrent paginated requests don't repeatedly hit the database engine with count scans.
3. Use database table statistics for approximate counts (e.g., querying `reltuples` from PostgreSQL's `pg_class` catalog: `SELECT reltuples::bigint FROM pg_class WHERE relname = 'products'`), which returns in less than 1 millisecond.

## 6. The Traps — What Goes Wrong

**Trap 1: The Missing Composite Index**
Implementing keyset SQL `WHERE (created_at, id) < (:ts, :id) ORDER BY created_at DESC, id DESC` without creating the matching composite index `CREATE INDEX idx_products_created_id ON products (created_at DESC, id DESC)`. Without this compound index, the database cannot perform a B-tree range seek; it falls back to a full table scan and in-memory sort, making keyset pagination even slower than offset pagination!

**Trap 2: Floating Sort Orders Without Deterministic Tie-Breakers**
Sorting by non-unique fields (such as `status`, `rating`, or `first_name`) without appending `id` as the secondary sort column. In relational databases, rows with identical column values have no guaranteed physical ordering. The database engine may return them in different order across successive queries depending on disk page layout or parallel worker scheduling, causing items to randomly vanish or appear twice between pages.

**Trap 3: Unbounded Page Limits Enabling Memory Exhaustion (DoS)**
Defining query parameters without an upper bound: `size: int = Query(20)`. An attacker can pass `?size=5000000`. FastAPI will attempt to fetch 5,000,000 ORM models, deserialize them through Pydantic validation, and convert them to JSON strings. This consumes gigabytes of RAM in seconds, triggering the Linux OOM (Out Of Memory) killer and killing the ASGI worker process. Always enforce `size: int = Query(20, ge=1, le=100)`.

**Trap 4: Slicing Python Lists in Memory After Calling `.all()`**
Writing handler logic like:
```python
# CATASTROPHIC BUG: Fetches entire 2-million-row table into Python memory!
items = session.execute(select(Product)).scalars().all()
paginated_items = items[offset : offset + size]
```
This loads millions of database records over the network socket into Python memory, initializes millions of ORM objects, and throws all but 20 away in Python. Pagination must always be pushed down to the SQL query compiler via `.limit()` and `.offset()` or `.where()`.

**Trap 5: Non-Reversible Cursors in Bidirectional Feeds**
Attempting backward pagination (e.g. "Load Previous Items") by merely flipping `<` to `>`. When navigating backward (`WHERE (created_at, id) > (:ts, :id)`), you must invert the `ORDER BY` to `ASC` for the query to pick the immediate preceding items, and then reverse the resulting Python array back to `DESC` before returning it to the client.

## 7. Compare With Related Concepts

| Pagination Pattern | Time Complexity | Random Access (Jump to Page N) | Stability Under Concurrent Writes | Index Requirement | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Offset Pagination** (`page`/`size`, `LIMIT`/`OFFSET`) | $O(N)$ (degrades linearly with page depth) | ✅ Yes (Direct jump to arbitrary page) | ❌ Poor (Causes duplicate & skipped rows) | Single index on sort column | Admin tables, search results (< 50,000 rows) |
| **Keyset / Cursor Pagination** (`next_cursor`, `WHERE tuple < cursor`) | $O(1)$ constant time (Index seek) | ❌ No (Sequential forward/backward only) | ✅ Perfect (Anchor never shifts) | Composite index on `(sort_col, id)` | Mobile feeds, infinite scroll, high-scale public APIs |
| **Time-Window Chunking** (`start_time`, `end_time`) | $O(\log N + K)$ (Index range scan) | ❌ No (Time range bound) | ✅ Perfect (Immutable time partitions) | Index on `timestamp` | Time-series logs, audit trails, financial ledgers |
| **NDJSON / SSE Streaming** (`StreamingResponse`) | $O(N)$ continuous stream | ❌ No (One continuous HTTP connection) | ⚠️ Subject to stream disconnects | Streaming cursor or server-side cursor | Large CSV/JSON data exports, LLM token streaming |

**Rules of Thumb:**
- If the UI has page numbers (1, 2, 3 ... 50) and the total dataset is under 100k rows, use **Offset Pagination** with cached total counts.
- If the UI is an infinite scroll, mobile feed, or high-volume REST API (Stripe/GitHub style), use **Keyset Cursor Pagination**.
- If exporting massive datasets (e.g. 500,000-row CSV reports), use **Streaming Chunking** with database server-side cursors (`yield_per`) rather than paginated HTTP requests.

## 8. 🧠 The Memory Hook

Offset pagination is counting steps from the starting line every single lap. Keyset cursor pagination is dropping you straight onto the exact coordinate with a GPS pin.
