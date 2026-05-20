# PUT vs PATCH

## Detailed explanation

`PUT` and `PATCH` both update resources, but their intent is different. `PUT` usually replaces the full resource representation at a URL, while `PATCH` applies a partial update. In interviews, the important part is not only definition, but how each affects validation, missing fields, retries, and client contracts.

## 1. One-line mental model

Use `PUT` to replace a resource and `PATCH` to change selected fields.

## 2. Problem it solves

Update APIs need clear semantics so clients know whether omitted fields stay unchanged or get cleared.

## 3. Core idea

- `PUT /users/1` sends the complete desired user representation.
- `PATCH /users/1` sends only fields to change.
- `PUT` is generally idempotent.
- `PATCH` can be idempotent if designed carefully.
- Missing fields in `PUT` may mean removal; missing fields in `PATCH` usually mean no change.

## 4. Visual / analogy

```txt
PUT:
Replace the whole document.

PATCH:
Edit a few lines in the document.
```

## 5. Minimal example

```http
PATCH /api/users/123
Content-Type: application/json

{
  "displayName": "Ravi"
}
```

Only `displayName` changes.

## 6. Real-world example

```txt
PUT /profile
Full profile form save.

PATCH /orders/123/status
Only status transition from pending to shipped.
```

## 7. Common interview questions

1. What is the difference between PUT and PATCH?
2. Is PUT idempotent?
3. Is PATCH idempotent?
4. What happens to missing fields in PUT?
5. When would you prefer PATCH?
6. How do you validate PATCH payloads?
7. Should status transitions use PATCH?

## 8. Active recall test

1. Design a full profile update endpoint.
2. Design an endpoint to update only a user's avatar.
3. Explain omitted fields in PUT vs PATCH.
4. Explain why PATCH validation differs from create validation.

## 9. Mistakes / traps

- Treating both methods as identical.
- Letting `PATCH` update fields users should not control.
- Using full create validation for partial updates.
- Accidentally clearing omitted `PUT` fields without documenting it.

## 10. Compare with related concepts

`PUT` and `PATCH` are not `POST`. `POST` often creates resources or triggers commands. `PUT` targets a known resource. `PATCH` changes part of a known resource.

## 11. Summary from memory

Explain the difference using a user profile update and an order status update.

## 12. Spaced revision prompts

- Day 1: Define PUT and PATCH.
- Day 3: Explain missing field behavior.
- Day 7: Explain idempotency for PUT and PATCH.
- Day 14: Design validation schemas for create, PUT, and PATCH.

