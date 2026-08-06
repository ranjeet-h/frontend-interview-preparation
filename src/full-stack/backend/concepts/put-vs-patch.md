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

#### What is the difference between PUT and PATCH?
- **The Engine Mechanism (Why it behaves this way):** PUT replaces the entire resource representation at a URL. The client sends all fields, and the server overwrites the existing resource with the sent data — omitted fields may be cleared or set to defaults. PATCH applies a partial update, sending only the fields to change. The server merges the provided fields with the existing resource, leaving omitted fields untouched. The HTTP specification defines PUT as idempotent; PATCH can be idempotent but isn't guaranteed to be.
- **The Unforgettable Mental Model:** PUT is **replacing a whole page** in a notebook. PATCH is **using an eraser and pencil** to change just a few words on the page.
- **The Trap:** Implementing PUT as a partial update in the backend. If your PUT handler only updates provided fields, it behaves like PATCH, confusing clients who expect full replacement semantics.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: PUT replaces the entire resource — the client sends the complete desired representation, and the server overwrites the existing resource. Omitted fields in PUT may be cleared. PATCH applies a partial update — the client sends only the fields to change, and the server merges them with the existing resource, leaving other fields untouched. PUT is idempotent by specification; PATCH can be idempotent if designed carefully. The choice depends on whether the client is sending a full resource or a targeted update."

#### Is PUT idempotent?
- **The Engine Mechanism (Why it behaves this way):** Yes, PUT is defined as idempotent by the HTTP specification. Sending the same PUT request multiple times produces the same final server state because each call replaces the resource with the identical representation. The first PUT creates or replaces the resource; subsequent PUTs with the same body produce no additional change. This makes PUT safe to retry on network failures without risk of duplicate side effects.
- **The Unforgettable Mental Model:** PUT is like **setting a thermostat to 72°F**. Whether you set it once or ten times, the temperature ends up at 72°F.
- **The Trap:** Breaking PUT idempotency by adding auto-generated fields like `updatedAt` timestamps or audit logs that change on every call. While timestamps change, the resource representation should still converge to the same logical state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, PUT is idempotent by HTTP specification. Calling PUT with the same representation multiple times produces the same final state — the resource is replaced with the sent data each time. This makes PUT safe to retry on network failures. The server implementation must honor this contract: the same PUT body should always produce the same resource state, even if internal fields like updatedAt change."

#### Is PATCH idempotent?
- **The Engine Mechanism (Why it behaves this way):** PATCH is not automatically idempotent — it depends on the implementation. A PATCH that sets a field to a specific value (`{ "status": "shipped" }`) is idempotent because applying it repeatedly produces the same result. A PATCH that performs a relative operation (`{ "views": "+1" }`) is not idempotent because each call increments the counter. The server must document whether its PATCH endpoints are idempotent, and clients should not assume they are.
- **The Unforgettable Mental Model:** PATCH can be like **setting a dial to a specific number** (idempotent) or **turning the dial clockwise one notch** (not idempotent). It depends on what the PATCH does.
- **The Trap:** Assuming all PATCH requests are idempotent and retrying them blindly. A non-idempotent PATCH retry can cause incorrect state — like incrementing a counter twice.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: PATCH is not automatically idempotent — it depends on the operation. A PATCH that sets fields to specific values is idempotent because repeated application produces the same result. A PATCH that performs relative operations like incrementing counters is not idempotent. When designing PATCH endpoints, I prefer idempotent operations — setting values rather than incrementing — so clients can safely retry on network failure. If non-idempotent PATCH is needed, I document it clearly and consider idempotency keys."

#### What happens to missing fields in PUT?
- **The Engine Mechanism (Why it behaves this way):** In a proper PUT implementation, missing fields in the request body are interpreted as "set to default" or "clear this field." Since PUT replaces the entire resource, the server constructs the resource from the sent representation alone. If the client omits the `email` field in a PUT to `/users/1`, the server may set email to null or reject the request if email is required. This is the key behavioral difference from PATCH, where omitted fields are left unchanged.
- **The Unforgettable Mental Model:** PUT is like **filling out a fresh form**. Any blank field stays blank — it doesn't copy over from the previous submission.
- **The Trap:** Clients sending partial data to PUT endpoints and accidentally clearing fields they didn't intend to change. This is why PATCH exists — for targeted updates without risking data loss.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: In PUT, missing fields are typically cleared or set to defaults because PUT replaces the entire resource. If a client sends `{ "name": "New" }` to PUT `/users/1` without an email field, the server may nullify the email. This is intentional PUT semantics — the sent representation becomes the complete new state. For partial updates where omitted fields should remain unchanged, PATCH is the correct method. I document this behavior clearly so clients know whether to send full or partial payloads."

#### When would you prefer PATCH?
- **The Engine Mechanism (Why it behaves this way):** PATCH is preferred when clients need to update specific fields without sending the entire resource, when the resource has many fields and sending all of them is wasteful, when multiple clients may update different fields concurrently, or when the update represents a state transition (like changing order status). PATCH reduces bandwidth, avoids accidental data loss from omitted fields, and supports concurrent partial updates more safely than PUT.
- **The Unforgettable Mental Model:** PATCH is like **sending a sticky note with corrections** instead of rewriting the entire document.
- **The Trap:** Using PATCH for everything to save bandwidth, even when the client has the full resource. If the client already has the complete data, PUT is cleaner and more explicit about intent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prefer PATCH when clients need targeted field updates, when resources have many fields and sending all of them is wasteful, or when multiple clients may update different fields concurrently. PATCH is also ideal for state transitions like changing an order status. It reduces bandwidth, prevents accidental data loss from omitted fields, and supports concurrent updates more safely. I use PUT when the client has the complete resource and intends to replace it entirely, like a full profile form submission."

#### How do you validate PATCH payloads?
- **The Engine Mechanism (Why it behaves this way):** PATCH validation differs from create validation because all fields are optional — the client may send any subset of fields. The validation schema must mark all fields as optional, then validate only the fields that are present. For each provided field, the same type, format, and range checks apply as in create. Additionally, PATCH validation should check business rules for the specific transition — for example, an order status can only move from "pending" to "shipped," not from "delivered" to "pending."
- **The Unforgettable Mental Model:** PATCH validation is like **checking only the items someone brought to a potluck**. You don't worry about what they didn't bring, but what they did bring must meet the rules.
- **The Trap:** Using the same "all fields required" validation schema for PATCH as for create. This rejects valid partial updates because required fields are missing — but they shouldn't be required in a partial update.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: PATCH validation uses a schema where all fields are optional, but provided fields are validated for type, format, and constraints. Unlike create validation which requires all mandatory fields, PATCH only validates what the client sends. I also add business logic validation for state transitions — for example, ensuring an order status moves through valid states. This requires two validation layers: schema validation for field formats, and domain validation for business rules on the specific fields being updated."

#### Should status transitions use PATCH?
- **The Engine Mechanism (Why it behaves this way):** Status transitions can use PATCH when they're simple field updates (`{ "status": "shipped" }`), but complex transitions with side effects may be better modeled as command endpoints (`POST /orders/:id/cancel`). PATCH is appropriate when the transition is a simple state change with minimal side effects. Command endpoints are better when the transition triggers workflows, sends notifications, validates complex preconditions, or represents a domain action rather than a field update.
- **The Unforgettable Mental Model:** Simple status change = **flipping a switch** (PATCH). Complex action = **pressing an emergency button** that triggers alarms, locks doors, and calls security (command endpoint).
- **The Trap:** Using PATCH for complex domain actions that have multiple side effects. `PATCH /orders/:id` with `{ "action": "cancel" }` mixes resource update with command semantics, which is confusing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Simple status transitions like moving an order from 'pending' to 'shipped' work well with PATCH — `PATCH /orders/:id` with `{ "status": "shipped" }`. But complex transitions with multiple side effects — like canceling an order which refunds payment, notifies the warehouse, and sends customer email — are better modeled as command endpoints: `POST /orders/:id/cancel`. The rule is: if it's a field update, use PATCH. If it's a domain action with workflows, use a command endpoint."

## 8. Active recall test

1. **Design a full profile update endpoint.**
   - **Explanation:** `PUT /users/:id/profile` — the client sends the complete profile representation including all fields. The server replaces the existing profile. Missing fields are cleared or set to defaults. Returns 200 with the updated profile.

2. **Design an endpoint to update only a user's avatar.**
   - **Explanation:** `PATCH /users/:id` with `{ "avatarUrl": "https://..." }`. Only the avatarUrl field changes; all other user fields remain untouched. Returns 200 with the updated user.

3. **Explain omitted fields in PUT vs PATCH.**
   - **Explanation:** In PUT, omitted fields are cleared or set to defaults because PUT replaces the entire resource. In PATCH, omitted fields are left unchanged because PATCH only updates the provided fields. This is the fundamental semantic difference between the two methods.

4. **Explain why PATCH validation differs from create validation.**
   - **Explanation:** Create validation requires all mandatory fields because a new resource needs complete data. PATCH validation makes all fields optional because the client is only sending changes. PATCH validates only the provided fields for type/format, and adds business rule validation for state transitions. Using create validation for PATCH would reject valid partial updates.

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

