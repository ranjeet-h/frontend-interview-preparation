# Autocomplete APIs

## Detailed explanation

Return fast, small suggestions with debounce-friendly, cancel-safe, prefix/fuzzy search behavior. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Autocomplete APIs optimize for low latency and changing user input.

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

In production, autocomplete apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for autocomplete?
- **The Engine Mechanism (Why it behaves this way):** `GET /api/autocomplete?q=term&type=product` returns a small list of suggestions (5-10 items). Resource-specific: `GET /api/products/autocomplete?q=...`, `GET /api/users/autocomplete?q=...`. The endpoint is optimized for low latency (<50ms) and handles rapid, cancelled requests gracefully.
- **The Unforgettable Mental Model:** The **Predictive Text Assistant**. As you type, it suggests completions based on what you've written so far. It's fast, limited to a few options, and updates with every keystroke.
- **The Trap:** Returning full resource objects — autocomplete should return minimal suggestion data (id, label, optional metadata) to keep responses small and fast.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose `GET /api/autocomplete?q=term&type=resource` that returns 5-10 minimal suggestions optimized for sub-50ms latency. Resource-specific endpoints scope the suggestions. The response contains only id, display label, and minimal metadata — never full resource objects."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** GET query params: `q` (search term), `type` (resource type), `limit` (max suggestions, default 10). Response: `{ success: true, data: { suggestions: [{ id, label, subtitle?, image? }], query, took: 12 } }`. The response is minimal — just enough data for the autocomplete dropdown.
- **The Unforgettable Mental Model:** The **Dropdown Menu**. Each suggestion shows a label (name), optional subtitle (category), and maybe an icon — just enough to identify the right choice.
- **The Trap:** Including unnecessary fields in suggestions — every extra field increases response size and latency, degrading the typing experience.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The request uses query parameters: q for the search term, type for the resource, and limit for max suggestions. The response contains minimal suggestion objects with id, label, optional subtitle, and query execution time. Only fields needed for the dropdown display are included — nothing more."

#### What validations are required for autocomplete APIs?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Minimum query length — 2-3 characters before searching; (2) Maximum query length — 200 characters; (3) Limit bounds — 1-20 suggestions; (4) Type allowlist — only allowed resource types; (5) Rate limiting — higher limits than search since autocomplete fires on every keystroke; (6) Input sanitization — prevent injection.
- **The Unforgettable Mental Model:** The **Quick-Response Guard**. The query must be long enough to be meaningful (min length), short enough to process (max length), the result count is bounded (limit), and the resource type is validated (allowlist).
- **The Trap:** Not setting a minimum query length — searching for single characters returns too many results and wastes resources.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce a minimum query length of 2-3 characters, maximum of 200, limit bounds of 1-20, type allowlisting, and input sanitization. Rate limiting is set higher than regular search since autocomplete fires on every keystroke. The minimum length is critical — single-character searches return too many results and waste resources."

#### What status codes can autocomplete APIs return?
- **The Engine Mechanism (Why it behaves this way):** `200 OK` always for valid queries (even with zero suggestions), `400 Bad Request` for invalid parameters (too short query, invalid type), `429 Too Many Requests` for rate limiting, `500 Internal Server Error` for backend failures. Zero suggestions is 200 — it's a valid outcome.
- **The Unforgettable Mental Model:** The **Quick Response Board**. Suggestions ready (200), bad input (400), too fast (429), system error (500). No suggestions is still a valid response (200).
- **The Trap:** Returning an error for zero suggestions — this breaks the autocomplete UX. An empty suggestions array with 200 is the correct response.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Autocomplete always returns 200 for valid queries, even with zero suggestions. 400 for invalid parameters like too-short queries or invalid types. 429 for rate limiting. 500 for backend failures. Zero suggestions is a valid outcome — returning an error would break the autocomplete dropdown behavior."

#### How do you secure autocomplete APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Rate limiting — higher threshold but still enforced; (2) Result filtering — only return records the user can access; (3) Query sanitization — prevent injection; (4) Response size limits — cap suggestion count; (5) Caching — cache common prefixes to reduce backend load; (6) Query logging — monitor for abuse patterns.
- **The Unforgettable Mental Model:** The **Fast but Secure Kiosk**. Quick responses (caching, optimized queries), but still checks access permissions (result filtering) and limits usage (rate limiting).
- **The Trap:** Not filtering autocomplete results by permissions — suggestions could reveal the existence of records the user shouldn't know about.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I rate-limit the endpoint, filter results by user permissions, sanitize queries, cap suggestion counts, cache common prefixes, and log query patterns. Permission filtering is critical — autocomplete suggestions could reveal record existence to unauthorized users if not filtered at the query level."

#### How do you avoid duplicate or unsafe autocomplete operations?
- **The Engine Mechanism (Why it behaves this way):** Autocomplete is inherently safe and idempotent — the same query always returns the same suggestions. Client-side debouncing prevents excessive requests. Server-side caching reduces redundant processing. Query deduplication handles concurrent identical requests.
- **The Unforgettable Mental Model:** The **Echo Chamber**. The same question gets the same answer. If you ask twice in rapid succession, the second answer comes from memory (cache) rather than re-processing.
- **The Trap:** Not implementing client-side debouncing — every keystroke triggers a request, overwhelming the server with near-identical queries.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Autocomplete is naturally idempotent. I rely on client-side debouncing (200-300ms) to prevent excessive requests, server-side caching for common prefixes, and query deduplication for concurrent identical requests. The combination of client debouncing and server caching keeps the load manageable even with rapid typing."

#### How do you test autocomplete APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) Valid query → suggestions returned; (2) Short query (< min length) → empty or error; (3) No matches → empty suggestions with 200; (4) Permission filtering → only accessible suggestions; (5) Response time < 50ms; (6) Rate limiting → 429 after threshold; (7) Special characters → sanitized; (8) Unicode/emoji → handled correctly; (9) Caching → repeated queries are fast; (10) Concurrent identical queries → deduplicated.
- **The Unforgettable Mental Model:** The **Speed and Accuracy Lab**. Every test measures both correctness (right suggestions) and speed (under 50ms), plus edge cases like special characters and permission filtering.
- **The Trap:** Not testing response time — autocomplete is useless if it's slow. Performance testing is as important as correctness testing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test suggestion accuracy, short query handling, no-matches behavior, permission filtering, response time under 50ms, rate limiting, special character handling, Unicode support, caching effectiveness, and query deduplication. Response time testing is critical — autocomplete is a latency-sensitive endpoint where performance is as important as correctness."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: autocomplete query (sanitized, suggestion count, latency, cache hit/miss). Metrics: queries per minute, average latency, cache hit rate, zero-suggestion rate, rate limit triggers, popular prefixes. Alerts: latency spike above 50ms, cache hit rate drop, rate limit spike.
- **The Unforgettable Mental Model:** The **Performance Dashboard**. Query volume, response times, cache effectiveness, and popular search prefixes are monitored in real-time.
- **The Trap:** Not monitoring cache hit rate — a drop indicates the cache is ineffective, causing increased backend load and slower response times.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log queries with sanitized input, suggestion count, latency, and cache status. Metrics track query volume, average latency, cache hit rate, zero-suggestion rate, and popular prefixes. I alert on latency spikes above 50ms, cache hit rate drops, and rate limit spikes. Cache hit rate is the key performance indicator — it directly affects response time and backend load."

## 8. Active recall test

1. **What is the target response time for autocomplete?**
   - **Explanation:** Under 50ms — autocomplete fires on every keystroke, so latency directly impacts the typing experience.

2. **Why use client-side debouncing for autocomplete?**
   - **Explanation:** To prevent sending a request on every keystroke — debouncing waits until the user pauses (200-300ms) before sending the query.

3. **What status code is returned for zero suggestions?**
   - **Explanation:** `200 OK` with an empty suggestions array — zero suggestions is a valid outcome, not an error.

4. **What is the minimum recommended query length for autocomplete?**
   - **Explanation:** 2-3 characters — single-character searches return too many results and waste resources.

5. **Why cache autocomplete queries?**
   - **Explanation:** Common prefixes are searched repeatedly — caching reduces backend load and ensures sub-50ms response times.

6. **Why filter autocomplete results by permissions?**
   - **Explanation:** To prevent revealing the existence of records the user shouldn't know about — suggestions act as an information leak if not filtered.

7. **What is the maximum recommended suggestion count?**
   - **Explanation:** 10-20 suggestions — more than this overwhelms the dropdown UI and increases response size unnecessarily.

8. **What metric indicates cache effectiveness?**
   - **Explanation:** Cache hit rate — a high rate means most queries are served from cache, keeping response times low and backend load minimal.

9. **How are concurrent identical autocomplete queries handled?**
   - **Explanation:** Query deduplication — if the same query is already being processed, concurrent requests wait for the result instead of re-processing.

10. **Why is autocomplete considered inherently safe?**
    - **Explanation:** It's a read-only operation that doesn't modify data — the same query always produces the same suggestions (idempotent and side-effect-free).

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Autocomplete APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
