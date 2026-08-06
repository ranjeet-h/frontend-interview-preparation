# Audit Log APIs

## Detailed explanation

Expose immutable, filterable activity records for compliance, debugging, and admin review. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Audit logs answer who did what, when, and from where.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, audit log apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for audit logs?
- **The Engine Mechanism (Why it behaves this way):** `GET /api/audit-logs` (list with filters), `GET /api/audit-logs/:id` (read single). Admin-only: `GET /api/admin/audit-logs` (full access with broader filters). Audit logs are read-only — no create, update, or delete endpoints. They are written by the system automatically when actions occur.
- **The Unforgettable Mental Model:** The **Security Camera Footage**. You can review the footage (read), filter by time and location (filters), but you can't edit or delete it (read-only). The cameras record automatically (system-written).
- **The Trap:** Exposing write endpoints for audit logs — audit logs must be immutable and system-written, never user-modifiable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Audit logs are read-only. I expose `GET /api/audit-logs` for listing with filters and `GET /api/audit-logs/:id` for reading individual entries. Admin endpoints provide broader access. There are no create, update, or delete endpoints — audit logs are written automatically by the system when actions occur and are immutable."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** List query params: `userId`, `action`, `resourceType`, `resourceId`, `dateFrom`, `dateTo`, `page`, `perPage`. Response: `{ success: true, data: { items: [{ id, userId, action, resourceType, resourceId, details, ipAddress, userAgent, createdAt }], pagination: { ... } } }`. No request body — all filtering via query parameters.
- **The Unforgettable Mental Model:** The **Incident Report**. Each entry shows who (userId), did what (action), to what (resource), when (createdAt), from where (IP), and with what device (userAgent).
- **The Trap:** Including sensitive data in audit log details — passwords, tokens, or PII should never appear in audit logs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: List requests use query parameters for filtering by user, action, resource, and date range. Each audit log entry contains userId, action, resourceType, resourceId, sanitized details, IP address, user agent, and timestamp. Sensitive data like passwords or tokens is never included in the details field."

#### What validations are required for audit log APIs?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Admin authorization — only admins can access full audit logs; (2) Date range limits — maximum 90 days per query; (3) Pagination bounds — perPage <= 100; (4) Filter value sanitization — prevent injection; (5) User-scoped access — non-admins can only see their own audit logs; (6) Index requirement — queries must use indexed fields for performance.
- **The Unforgettable Mental Model:** The **Archive Reading Room**. Only authorized personnel (admin auth), limited search window (date range), bounded results (pagination), and sanitized search terms (injection prevention).
- **The Trap:** Not limiting date range — querying the entire audit log history can cause massive database scans and performance degradation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce admin authorization for full access, limit date ranges to 90 days per query, bound pagination, sanitize filter values, restrict non-admins to their own logs, and ensure queries use indexed fields. The date range limit is critical — unbounded date queries can cause full table scans on large audit log tables."

#### What status codes can audit log APIs return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` for successful queries (even with zero results), `400 Bad Request` for invalid filters or date ranges, `403 Forbidden` for non-admin accessing admin logs, `404 Not Found` for specific log ID not found, `429 Too Many Requests` for rate limiting. Zero results is 200 — it's a valid query outcome.
- **The Unforgettable Mental Model:** The **Archive Query Results**. Records found (200), bad query (400), not authorized (403), record not found (404), too many queries (429). No records is still a valid result (200).
- **The Trap:** Returning 404 for zero results — the query was valid, it just found no matching records. 200 with an empty array is correct.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Audit log queries always return 200 for valid requests, even with zero results. 400 for invalid filters or date ranges. 403 for non-admins accessing admin logs. 404 for specific log IDs not found. 429 for rate limiting. Zero results is a valid outcome — the query executed successfully, it just found nothing."

#### How do you secure audit log APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Admin-only full access — only admins see all audit logs; (2) User-scoped access — non-admins see only their own logs; (3) Immutable storage — audit logs cannot be modified or deleted; (4) Sensitive data filtering — PII, passwords, tokens are redacted; (5) Rate limiting — prevent log scraping; (6) Separate storage — audit logs stored separately from application data for tamper resistance.
- **The Unforgettable Mental Model:** The **Tamper-Proof Vault**. Only authorized viewers (admin access), limited personal viewing (user-scoped), records can't be altered (immutable), sensitive info is blacked out (redaction), and the vault is separate from the main building (separate storage).
- **The Trap:** Storing audit logs in the same database table as application data — if the application database is compromised, audit logs could be altered to cover tracks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I restrict full access to admins, limit non-admins to their own logs, store audit logs immutably in a separate database, redact sensitive data, and rate-limit access. Separate storage is critical — if the application database is compromised, tamper-proof audit logs in a separate system provide an unalterable record of what happened."

#### How do you avoid duplicate or unsafe audit log operations?
- **The Engine Mechanism (Why it behaves this way):** Audit logs are inherently read-only and immutable — there are no write operations from the API. The system writes audit logs automatically via middleware or event listeners. Write-side deduplication ensures the same action isn't logged twice. Append-only storage prevents modification.
- **The Unforgettable Mental Model:** The **One-Way Street**. Data flows in one direction: actions generate log entries, and those entries can only be read, never modified or deleted.
- **The Trap:** Allowing audit log deletion — even admins should not be able to delete audit logs, as this would compromise the integrity of the audit trail.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Audit logs are append-only and immutable — there are no delete or update operations, even for admins. The system writes logs automatically via middleware, with deduplication to prevent double-logging. Append-only storage ensures the audit trail cannot be altered. If retention policies require cleanup, old logs are archived, not deleted."

#### How do you test audit log APIs?
- **The Engine Mechanism (Why it behaves this behavior):** Test scenarios: (1) Admin lists all logs → full access; (2) Non-admin lists logs → only own logs; (3) Non-admin accesses admin endpoint → 403; (4) Filter by date range → correct results; (5) Date range exceeds limit → 400; (6) Sensitive data redacted → no passwords/tokens in details; (7) Pagination → correct page navigation; (8) Zero results → 200 with empty array; (9) Log immutability → no write endpoints exist; (10) Performance → queries use indexes.
- **The Unforgettable Mental Model:** The **Audit Trail Verification**. Every access pattern is tested: admin vs. non-admin, filtering, pagination, sensitive data handling, and the immutability guarantee.
- **The Trap:** Not testing that sensitive data is redacted — audit logs that contain passwords or tokens are a security vulnerability.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test admin vs. non-admin access, date range filtering, pagination, sensitive data redaction, zero-result handling, and query performance. The sensitive data redaction test is critical — I verify that passwords, tokens, and PII never appear in audit log details. I also verify that no write endpoints exist, confirming immutability."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: audit log access (user ID, filters used, result count, timestamp), unauthorized access attempts, rate limit triggers. Metrics: audit log queries per day, average latency, most-filtered fields, admin vs. non-admin query ratio, storage growth rate. Alerts: unauthorized access attempts, storage growth exceeding threshold, query latency spike.
- **The Unforgettable Mental Model:** The **Audit System Monitor**. Who's accessing the audit logs, how often, and whether any unauthorized access attempts are occurring.
- **The Trap:** Not monitoring storage growth — audit logs grow continuously and can fill up storage if retention policies aren't enforced.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log audit log access with user ID, filters, result count, and timestamp. Metrics track query volume, latency, popular filters, and storage growth rate. I alert on unauthorized access attempts, storage growth exceeding thresholds, and query latency spikes. Storage monitoring is critical — audit logs grow continuously and need retention policies to prevent storage exhaustion."

## 8. Active recall test

1. **Why are audit logs read-only?**
   - **Explanation:** Audit logs are an immutable record of system actions — allowing modifications would compromise the integrity of the audit trail and enable cover-ups.

2. **Who can access all audit logs?**
   - **Explanation:** Only admin users — non-admins can only see their own audit log entries.

3. **Why store audit logs in a separate database?**
   - **Explanation:** For tamper resistance — if the application database is compromised, separate audit logs provide an unalterable record of what happened.

4. **What should never appear in audit log details?**
   - **Explanation:** Passwords, tokens, PII, or any sensitive data — these should be redacted before the audit log entry is written.

5. **Why limit date range queries to 90 days?**
   - **Explanation:** To prevent full table scans on large audit log tables — unbounded date queries can cause severe performance degradation.

6. **What status code is returned for zero audit log results?**
   - **Explanation:** `200 OK` with an empty array — the query was valid, it just found no matching records.

7. **How are audit log entries created?**
   - **Explanation:** Automatically by the system via middleware or event listeners — there are no API endpoints for creating audit logs manually.

8. **What metric indicates storage management issues?**
   - **Explanation:** Storage growth rate — audit logs grow continuously, and unchecked growth can fill up storage without retention policies.

9. **Why deduplicate audit log writes?**
   - **Explanation:** To prevent the same action from being logged multiple times, which would inflate the audit trail and confuse investigations.

10. **What happens to old audit logs under retention policies?**
    - **Explanation:** They are archived to cold storage (e.g., S3 Glacier) rather than deleted — this preserves the audit trail while freeing up primary storage.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Audit Log APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
