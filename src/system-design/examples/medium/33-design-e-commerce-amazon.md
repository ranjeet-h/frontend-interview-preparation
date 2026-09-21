# 33. Design E-commerce (Amazon)

[← Medium examples](index.md)

**Why interviewers ask** — Classic commerce split: catalog browse, cart, checkout, inventory, fulfillment — each with different consistency needs.

**Core insight** — Catalog is read-heavy and cacheable; order placement needs ACID inventory decrement and idempotent payment; cart is per-user soft state.

**Architecture**

```txt
Browse → product catalog (cache + search index)
Cart   → session/user cart service (Redis)
Checkout → order service (ACID) → inventory reserve → payment → shipping queue
       → warehouse/fulfillment workers
```

- **Catalog** — Product, SKU, price; CDN for images; search via inverted index.
- **Cart** — Merge anonymous and logged-in carts; no inventory hold until checkout.
- **Order** — Saga or 2PC across inventory + payment; order ID as idempotency key.
- **Inventory** — Reserve on checkout start; release on timeout or cancel.

**Key decisions** — Don't hold inventory in cart; idempotent checkout API; eventual consistency OK for catalog/search; strong for money and stock.

**Scale & failure** — Read replicas and cache for catalog; inventory hot SKUs sharded; payment retry safe via idempotency; oversell prevented by atomic decrement.

**Deep link** — [Order management](../../backend-designs/design-an-order-management-system.md) · [Inventory](../../backend-designs/design-an-inventory-management-system.md) · [Payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook** — Cart is soft, checkout is hard — inventory and money lock together.
