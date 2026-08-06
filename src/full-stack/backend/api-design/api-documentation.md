# API Documentation

## Detailed explanation

Document endpoints, auth, schemas, errors, examples, and versioning so clients can integrate correctly. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Docs are executable communication between backend and consumers.

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

In production, api documentation should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What makes good API documentation?
- **The Engine Mechanism (Why it behaves this way):** Good API documentation includes: endpoint descriptions with HTTP methods, request/response schemas with examples, authentication requirements, error codes with descriptions, rate limits, versioning information, and interactive testing (Swagger/Redoc). It's generated from source code (OpenAPI spec) to stay in sync with implementation. Documentation is the contract between backend and frontend teams.
- **The Unforgettable Mental Model:** The **User Manual for a Complex Appliance**. It tells you what each button does (endpoints), what to expect when you press it (responses), what happens when things go wrong (errors), and includes troubleshooting guides (error codes).
- **The Trap:** Writing documentation manually and letting it drift from the implementation — auto-generated docs from code annotations stay accurate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Good API documentation includes endpoint descriptions with methods, request/response schemas with examples, authentication requirements, error codes, rate limits, and versioning info. It should be auto-generated from source code using OpenAPI specs to stay in sync. Documentation is the contract between backend and frontend teams — it must be accurate, complete, and interactive."

#### What tools should you use for API documentation?
- **The Engine Mechanism (Why it behaves this way):** Documentation tools: (1) OpenAPI/Swagger — industry standard, generates interactive docs; (2) Redoc — beautiful static docs from OpenAPI specs; (3) Postman Collections — shareable, testable API definitions; (4) Stoplight — design-first API documentation; (5) Docusaurus/GitBook — for guides and tutorials alongside reference docs. OpenAPI is the foundation — other tools build on it.
- **The Unforgettable Mental Model:** The **Documentation Toolkit**. OpenAPI is the blueprint, Swagger is the interactive viewer, Redoc is the polished manual, Postman is the test bench, and Docusaurus is the user guide library.
- **The Trap:** Using only static documentation without interactive testing — developers need to try endpoints directly in the docs to understand them.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use OpenAPI as the foundation — it's the industry standard and generates interactive docs. Swagger UI provides interactive testing, Redoc creates beautiful static docs, Postman Collections enable sharing and testing, and Docusaurus hosts guides and tutorials. OpenAPI annotations in the code keep docs in sync with implementation."

#### What should every endpoint documentation include?
- **The Engine Mechanism (Why it behaves this behavior):** Per endpoint: HTTP method and path, summary and description, authentication requirements, request parameters (path, query, body) with types and descriptions, request body schema with examples, response schemas for each status code with examples, error codes specific to this endpoint, rate limits, and deprecation status. Examples should include both success and failure cases.
- **The Unforgettable Mental Model:** The **Recipe Card**. Each recipe (endpoint) lists ingredients (parameters), instructions (description), expected outcome (success response), what can go wrong (errors), and serving suggestions (examples).
- **The Trap:** Only documenting the success response — error responses are equally important for frontend developers to handle failures correctly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Every endpoint needs: method and path, description, auth requirements, all parameters with types and descriptions, request body schema with examples, response schemas for each status code with examples, endpoint-specific error codes, rate limits, and deprecation status. Documenting error responses is as important as success responses — frontend developers need both to build robust error handling."

#### How do you keep documentation in sync with code?
- **The Engine Mechanism (Why it behaves this way):** Sync strategies: (1) Code-first — annotate code with OpenAPI comments, generate docs on build; (2) Design-first — write OpenAPI spec first, generate server stubs and docs; (3) CI validation — fail builds if docs don't match implementation; (4) Automated testing — test examples in docs against live API; (5) Documentation reviews — include docs in PR review process. Code-first is most practical for most teams.
- **The Unforgettable Mental Model:** The **Self-Updating Map**. As the terrain changes (code updates), the map (documentation) updates automatically. If someone tries to publish a map that doesn't match the terrain, the process fails (CI validation).
- **The Trap:** Treating documentation as a separate task done after coding — docs should be part of the development process, not an afterthought.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use code-first approach with OpenAPI annotations that generate docs on build. CI validation fails builds if docs don't match implementation. Automated tests verify doc examples against the live API. Documentation is included in PR reviews. The key is making documentation part of the development workflow, not a separate after-the-fact task."

#### How do you document error responses?
- **The Engine Mechanism (Why it behaves this way):** Error documentation: list all possible error codes per endpoint, provide human-readable descriptions, include example error responses, document retryable flags, link to troubleshooting guides, and explain what the frontend should do for each error. Group errors by category: validation, authentication, authorization, not found, conflict, server error.
- **The Unforgettable Mental Model:** The **Troubleshooting Guide**. Each error code is a symptom, the description explains the cause, the example shows what it looks like, and the troubleshooting guide tells you how to fix it.
- **The Trap:** Listing error codes without explaining what the frontend should do — developers need actionable guidance, not just descriptions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I document all error codes per endpoint with descriptions, example responses, retryable flags, and frontend action guidance. Errors are grouped by category: validation, authentication, authorization, not found, conflict, server error. The key is actionable documentation — not just describing the error, but telling the frontend developer what to do about it."

#### How do you document authentication requirements?
- **The Engine Mechanism (Why it behaves this way):** Auth documentation: specify auth type per endpoint (none, API key, Bearer token, session cookie), explain how to obtain credentials, document token expiration and refresh flow, provide example auth headers, document scope/permission requirements, and include auth error responses. Use OpenAPI security schemes for standardized auth documentation.
- **The Unforgettable Mental Model:** The **Building Access Guide**. Which doors require keys (auth endpoints), what type of key (auth type), where to get the key (credential flow), when the key expires (token TTL), and what happens with the wrong key (auth errors).
- **The Trap:** Not documenting token expiration and refresh — developers will build integrations that break when tokens expire.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I document auth type per endpoint, credential acquisition flow, token expiration and refresh, example auth headers, permission requirements, and auth error responses. Token expiration and refresh documentation is critical — developers need to handle token lifecycle correctly. I use OpenAPI security schemes for standardized auth documentation."

#### How do you test API documentation quality?
- **The Engine Mechanism (Why it behaves this way):** Documentation tests: (1) Schema validation — all endpoints have complete schemas; (2) Example testing — doc examples produce valid responses; (3) Completeness checks — all endpoints documented; (4) Link validation — no broken links in docs; (5) User testing — have developers use docs to build integrations; (6) Automated doc generation tests — docs build successfully in CI.
- **The Unforgettable Mental Model:** The **Documentation Quality Lab**. Every aspect is tested: completeness (all endpoints covered), accuracy (examples work), usability (developers can build from docs), and integrity (no broken links).
- **The Trap:** Not having real developers test the documentation — the author's perspective differs from the consumer's perspective.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test schema completeness, verify doc examples produce valid responses, check that all endpoints are documented, validate links, and have real developers use the docs to build integrations. User testing is the most valuable — the author's perspective differs from the consumer's. If a developer can't build an integration from the docs alone, the docs need improvement."

#### What logs and metrics would you add for API documentation?
- **The Engine Mechanism (Why it behaves this way):** Logs: doc generation failures, schema validation errors, example test failures. Metrics: doc page views, most-viewed endpoints, search terms in docs, doc feedback ratings, time-to-first-successful-call (from doc to working integration). Alerts: doc generation failures, outdated endpoints (code changed but docs didn't), high bounce rate on doc pages.
- **The Unforgettable Mental Model:** The **Documentation Analytics**. Which endpoints are most looked up, what developers search for, how satisfied they are with the docs, and how quickly they can build working integrations.
- **The Trap:** Not measuring time-to-first-successful-call — this metric directly measures documentation effectiveness.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I track doc page views, most-viewed endpoints, search terms, feedback ratings, and time-to-first-successful-call. I alert on doc generation failures, outdated endpoints, and high bounce rates. Time-to-first-successful-call is the key metric — it measures how effectively the documentation enables developers to build working integrations."

## 8. Active recall test

1. **What is the industry standard for API documentation?**
   - **Explanation:** OpenAPI/Swagger — it's the widely adopted specification for describing REST APIs, enabling interactive documentation and code generation.

2. **Why auto-generate documentation from code?**
   - **Explanation:** To keep docs in sync with implementation — manual docs drift over time and become inaccurate, causing developer frustration and integration bugs.

3. **What should every endpoint's documentation include?**
   - **Explanation:** Method, path, description, auth requirements, parameters with types, request/response schemas with examples, error codes, rate limits, and deprecation status.

4. **Why document error responses as thoroughly as success responses?**
   - **Explanation:** Frontend developers need to handle failures correctly — without error documentation, they can't build robust error handling or display meaningful messages.

5. **What is the code-first approach to API documentation?**
   - **Explanation:** Annotate code with OpenAPI comments and generate docs on build — docs stay in sync with implementation because they're derived from the source.

6. **What is the most important metric for documentation effectiveness?**
   - **Explanation:** Time-to-first-successful-call — how quickly a developer can go from reading the docs to making a successful API call.

7. **Why include real developers in documentation testing?**
   - **Explanation:** The author's perspective differs from the consumer's — real developers reveal gaps, ambiguities, and missing information that the author overlooks.

8. **What should auth documentation include beyond the auth type?**
   - **Explanation:** Credential acquisition flow, token expiration and refresh, example headers, permission requirements, and auth error responses.

9. **How do you prevent documentation drift?**
   - **Explanation:** CI validation that fails builds if docs don't match implementation, automated example testing, and including docs in PR reviews.

10. **What is the purpose of OpenAPI security schemes?**
    - **Explanation:** Standardized documentation of authentication methods — they define auth types, flows, and requirements in a machine-readable format that tools can use.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for API Documentation.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
