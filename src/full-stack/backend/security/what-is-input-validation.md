# What is input validation

## Detailed explanation

What is input validation is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is input validation by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend security rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is input validation affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is input validation?
- **The Engine Mechanism (Why it behaves this way):** Input validation is the process of verifying that user-supplied data meets expected criteria before processing it. This includes type checking (string, number, boolean), format validation (email, URL, phone), length limits, range checks, allowlist validation, and schema validation. Invalid input is rejected with a structured error message before it reaches business logic or the database.
- **The Unforgettable Mental Model:** The **Airport Security Checkpoint**. Every passenger (input) goes through screening: ID check (type verification), metal detector (format validation), bag scan (content validation). If anything fails, the passenger is denied entry before reaching the gate (business logic).
- **The Trap**: Thinking input validation is only for security. It's also for data quality, application stability, and user experience. Invalid input causes bugs, crashes, and poor UX even without malicious intent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Input validation is the process of verifying that user-supplied data meets expected criteria before processing. It includes type checking, format validation, length limits, range checks, allowlist validation, and schema validation. Invalid input is rejected with structured errors before reaching business logic or the database. Input validation is critical for security (preventing injection attacks), data quality (ensuring consistent data), and application stability (preventing crashes from unexpected input)."

#### What are the types of input validation?
- **The Engine Mechanism (Why it behaves this way):** Types: (1) Type validation — ensure input is the expected type (string, number, boolean), (2) Format validation — regex patterns for email, URL, phone, (3) Length validation — min/max character limits, (4) Range validation — numeric bounds, (5) Allowlist validation — only permitted values accepted, (6) Schema validation — JSON schema, Zod, Joi for complex objects, (7) Business rule validation — domain-specific rules (e.g., end date after start date).
- **The Unforgettable Mental Model:** The **Multi-Layer Filter**. Each validation type is a filter layer: type filter (right material?), format filter (right shape?), length filter (right size?), range filter (right weight?), allowlist filter (approved material?), schema filter (right assembly?).
- **The Trap**: Only validating at one layer. Type validation without format validation accepts `"not-an-email"` as a valid string email field. Multiple validation layers catch different issues.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Input validation has multiple types: type validation (is it a string?), format validation (does it match email pattern?), length validation (within bounds?), range validation (numeric limits?), allowlist validation (permitted values?), schema validation (complex object structure?), and business rule validation (domain-specific rules). I use multiple layers — type validation catches basic issues, format validation catches pattern issues, and schema validation catches structural issues. No single type is sufficient."

#### How do you implement input validation in Express?
- **The Engine Mechanism (Why it behaves this way):** In Express, input validation is implemented as middleware before route handlers. Libraries like Zod, Joi, or express-validator define validation schemas that check request body, params, and query. Example with Zod: `const schema = z.object({ email: z.string().email(), age: z.number().min(18) }); const result = schema.safeParse(req.body); if (!result.success) return res.status(400).json({ error: result.error.errors });`. Validated data is then passed to the handler.
- **The Unforgettable Mental Model:** The **Pre-Flight Checklist**. Before the plane (request) takes off (reaches the handler), it goes through a checklist (validation schema). Every item must pass — if any fails, the plane doesn't take off.
- **The Trap**: Validating in the route handler instead of middleware. Validation in the handler mixes concerns and makes it harder to reuse validation logic across routes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement input validation as middleware before route handlers using libraries like Zod or Joi. The validation schema checks request body, params, and query. If validation fails, I return a 400 with structured error details. If it passes, the validated data is passed to the handler. I use middleware so validation logic is reusable across routes and separated from business logic. I also validate at the API gateway level for an additional layer of defense."

#### What would you monitor for input validation?
- **The Engine Mechanism (Why it behaves this way):** Monitor: validation rejection rates (how many requests fail validation), validation error types (which fields fail most often), validation latency (schema validation performance), and bypass detection (requests that reach handlers with invalid data). Alert on high rejection rates (indicates API contract issues) and validation bypasses (indicates missing validation).
- **The Unforgettable Mental Model:** The **Validation Dashboard**. You're watching how many inputs are being rejected (rejection rates), which fields fail most often (error types), and whether any invalid data is slipping through (bypass detection).
- **The Trap**: Not monitoring validation bypasses. If validation middleware is accidentally skipped, invalid data reaches business logic, potentially causing security issues.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor input validation through rejection rates, error type distribution, validation latency, and bypass detection. High rejection rates indicate API contract issues — clients are sending invalid data. Bypass detection catches cases where validation middleware is skipped. I also monitor validation error types to identify fields that frequently fail, which may indicate confusing API documentation or client-side bugs. All validation failures are logged with field-level details for debugging."

## 8. Active recall test

1. **What is input validation?**
   - **Explanation:** Process of verifying user-supplied data meets expected criteria before processing. Includes type, format, length, range, allowlist, schema, and business rule validation.
2. **What are the types of input validation?**
   - **Explanation:** Type (string/number), format (email/URL regex), length (min/max), range (numeric bounds), allowlist (permitted values), schema (JSON structure), business rules (domain-specific).
3. **How do you implement input validation in Express?**
   - **Explanation:** As middleware before route handlers using Zod, Joi, or express-validator. Define schema, validate req.body/params/query, return 400 on failure, pass validated data to handler.
4. **Why validate in middleware instead of route handlers?**
   - **Explanation:** Separation of concerns — validation logic is reusable across routes, separated from business logic. Makes testing and maintenance easier.
5. **What is schema validation?**
   - **Explanation:** Validating complex object structures against a defined schema (JSON schema, Zod, Joi). Checks field types, required fields, nested objects, and constraints.
6. **Why is allowlist validation safer than blocklist validation?**
   - **Explanation:** Allowlist only permits known-good values (deny by default). Blocklist tries to block known-bad values (allow by default). Attackers always find new bad values that aren't on the blocklist.
7. **What should you monitor for input validation?**
   - **Explanation:** Rejection rates, error type distribution, validation latency, and bypass detection. Alert on high rejection rates and validation bypasses.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is input validation in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is input validation in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
