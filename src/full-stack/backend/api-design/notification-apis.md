# Notification APIs

## Detailed explanation

Create, list, mark-read, deliver, and preference-manage notifications across channels. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Notification APIs separate notification records from delivery side effects.

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

In production, notification apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What endpoints would you expose for notifications?
- **The Engine Mechanism (Why it behaves this way):** `GET /api/notifications` (list user's notifications), `GET /api/notifications/:id` (read single), `POST /api/notifications/:id/read` (mark as read), `POST /api/notifications/read-all` (mark all as read), `DELETE /api/notifications/:id` (delete). Admin: `POST /api/admin/notifications` (create broadcast). Real-time: WebSocket/SSE for push delivery.
- **The Unforgettable Mental Model:** The **Mailbox System**. New mail arrives (notification), you browse the inbox (list), open individual letters (read), mark as read, delete old ones, and the postmaster can send bulk mailings (broadcast).
- **The Trap:** Not providing a real-time channel — users expect instant notification delivery, not just polling the list endpoint.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I expose REST endpoints for listing, reading, marking as read, and deleting notifications. Admin endpoints handle broadcast creation. For real-time delivery, I use WebSockets or Server-Sent Events to push new notifications to connected clients. The REST API handles the notification record, while the real-time channel handles delivery."

#### What request body and response shape would you use?
- **The Engine Mechanism (Why it behaves this way):** List response: `{ success: true, data: { items: [{ id, type, title, message, read, createdAt, actionUrl? }], pagination: { ... }, unreadCount: 5 } }`. Mark read request: empty body or `{ readAt: timestamp }`. Create (admin): `{ type, title, message, targetUsers: [...] | targetRole, actionUrl? }`. Real-time event: `{ type: "notification", data: { id, type, title, message } }`.
- **The Unforgettable Mental Model:** The **Notification Card**. Each notification shows a title, message, timestamp, read status, and optional action link — like a card in an inbox.
- **The Trap:** Not including unreadCount in list responses — the frontend needs this for the notification badge without a separate API call.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: List responses include notifications with type, title, message, read status, timestamp, and optional action URL, plus pagination and unreadCount. Mark-read accepts an empty body. Admin create accepts type, title, message, and target specification. Real-time events carry minimal data for the push notification. UnreadCount in the list response eliminates a separate API call for the badge."

#### What validations are required for notification APIs?
- **The Engine Mechanism (Why it behaves this way):** Validations: (1) Ownership — users can only access their own notifications; (2) Notification type allowlist — only valid types; (3) Target validation for broadcasts — targetUsers or targetRole must be valid; (4) Message length limits — title and message have max lengths; (5) Rate limiting — prevent notification spam; (6) Pagination bounds — page and perPage limits.
- **The Unforgettable Mental Model:** The **Mailroom Rules**. Only your mail (ownership), valid mail types (type allowlist), correct addressing (target validation), size limits (message length), and no spam (rate limiting).
- **The Trap:** Not validating broadcast targets — sending a notification to an invalid targetRole or nonexistent user IDs wastes resources and causes errors.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce ownership — users can only access their own notifications. I validate notification types against an allowlist, verify broadcast targets exist, enforce message length limits, rate-limit notification creation, and bound pagination. Target validation for broadcasts is critical — sending to invalid targets wastes resources and causes downstream errors."

#### What status codes can notification APIs return?
- **The Engine Mechanism (Why it behaves this way):** List/Read: `200 OK` or `404 Not Found`. Mark read: `200 OK` or `404 Not Found`. Delete: `204 No Content` or `404 Not Found`. Create (admin): `201 Created`. Validation errors: `400 Bad Request`. Authorization errors: `403 Forbidden` (non-admin creating notifications). Rate limiting: `429 Too Many Requests`.
- **The Unforgettable Mental Model:** The **Mailbox Status Board**. Mail available (200), mail not found (404), marked as read (200), deleted (204), new mail sent (201), bad address (400), not authorized (403), too much mail (429).
- **The Trap:** Returning 403 for accessing another user's notification — return 404 instead to avoid leaking notification existence.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Standard CRUD status codes apply: 200 for reads, 201 for creation, 204 for deletion, 404 for not found. For authorization, I return 404 instead of 403 when a user tries to access another user's notification — this avoids leaking notification existence. 400 for validation errors, 429 for rate limiting."

#### How do you secure notification APIs?
- **The Engine Mechanism (Why it behaves this way):** Security measures: (1) Ownership enforcement — users can only access their notifications; (2) Admin-only creation — only admins can create broadcast notifications; (3) Rate limiting — prevent notification spam; (4) Content sanitization — prevent XSS in notification messages; (5) Target scope limits — prevent broadcasting to all users without super-admin approval; (6) Real-time channel auth — WebSocket/SSE connections require valid authentication.
- **The Unforgettable Mental Model:** The **Secure Mail System**. Only your mail is visible (ownership), only the postmaster sends bulk mail (admin creation), mail content is checked (sanitization), and the delivery channel is secured (real-time auth).
- **The Trap:** Not sanitizing notification content — if notifications support rich text or links, XSS vulnerabilities could execute malicious scripts in the user's browser.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I enforce strict ownership, restrict notification creation to admins, rate-limit to prevent spam, sanitize content for XSS, limit broadcast scope, and authenticate real-time connections. Content sanitization is critical — notifications often contain links or rich text that could be exploited for XSS if not properly sanitized."

#### How do you avoid duplicate or unsafe notification operations?
- **The Engine Mechanism (Why it behaves this way):** Marking as read is idempotent — marking an already-read notification is a no-op. Broadcast deduplication prevents sending the same notification twice to the same user. Notification creation uses idempotency keys for retry safety. Real-time delivery uses at-least-once semantics with client-side deduplication.
- **The Unforgettable Mental Model:** The **Read Receipt System**. Marking a letter as read twice doesn't change anything (idempotent). The postmaster keeps a log of who received which letter (deduplication), and if a letter is delivered twice, the recipient ignores the duplicate.
- **The Trap:** Not deduplicating real-time notifications — network reconnections can cause duplicate delivery, and the client may show the same notification twice.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Mark-read is idempotent. Broadcast creation deduplicates to prevent sending the same notification twice to a user. Notification creation accepts idempotency keys for retry safety. Real-time delivery uses at-least-once semantics with client-side deduplication by notification ID. The client tracks received IDs and ignores duplicates."

#### How do you test notification APIs?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) List notifications → only user's notifications; (2) Access another user's notification → 404; (3) Mark as read → status updated; (4) Mark already-read → idempotent; (5) Mark all as read → all updated; (6) Delete notification → removed; (7) Admin broadcast → targeted users receive it; (8) Real-time delivery → notification pushed; (9) Rate limiting → 429 after threshold; (10) Unread count → accurate.
- **The Unforgettable Mental Model:** The **Full Mail System Test**. Every operation is tested: receiving, reading, marking, deleting, broadcasting, real-time delivery, and the accuracy of unread counts.
- **The Trap:** Not testing real-time delivery — the REST API and real-time channel must work together, and integration testing is essential.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test listing with ownership enforcement, cross-user access rejection, mark-read idempotency, mark-all-read, deletion, admin broadcast targeting, real-time delivery, rate limiting, and unread count accuracy. The real-time delivery test is critical — it validates that the REST API and WebSocket/SSE channel work together correctly."

#### What logs and metrics would you add?
- **The Engine Mechanism (Why it behaves this way):** Logs: notification created/delivered/read/deleted (user ID, notification ID, type, timestamp), broadcast sent, real-time connection events. Metrics: notifications per user per day, read rate, delivery latency, real-time connection count, broadcast reach. Alerts: delivery latency spike, real-time connection drops, broadcast failure rate.
- **The Unforgettable Mental Model:** The **Notification Operations Center**. Delivery rates, read rates, connection health, and broadcast reach are monitored in real-time.
- **The Trap:** Not tracking read rate — a low read rate indicates notifications are not relevant or users are overwhelmed by volume.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log notification lifecycle events with user ID, notification ID, type, and timestamp. Metrics track notification volume per user, read rate, delivery latency, real-time connection count, and broadcast reach. I alert on delivery latency spikes, real-time connection drops, and broadcast failures. Read rate is the key engagement metric — low rates indicate relevance or volume problems."

## 8. Active recall test

1. **What endpoints manage user notifications?**
   - **Explanation:** GET /api/notifications (list), GET /api/notifications/:id (read), POST /api/notifications/:id/read (mark read), POST /api/notifications/read-all (mark all), DELETE /api/notifications/:id (delete).

2. **Why return 404 instead of 403 for accessing another user's notification?**
   - **Explanation:** To avoid leaking notification existence — returning 403 confirms the notification exists but is forbidden, while 404 reveals nothing.

3. **How are notifications delivered in real-time?**
   - **Explanation:** Via WebSockets or Server-Sent Events (SSE) — these persistent connections push new notifications to connected clients instantly.

4. **What should list responses include besides notifications?**
   - **Explanation:** Pagination metadata and unreadCount — the unread count enables the notification badge without a separate API call.

5. **Why is mark-read idempotent?**
   - **Explanation:** Marking an already-read notification has no additional effect — the state is already "read," so the operation is safe to retry.

6. **Who can create broadcast notifications?**
   - **Explanation:** Only admin users — broadcast notifications affect many users and should be a privileged operation.

7. **How does the client handle duplicate real-time notifications?**
   - **Explanation:** Client-side deduplication by notification ID — the client tracks received IDs and ignores duplicates from network reconnections.

8. **What metric indicates notification relevance?**
   - **Explanation:** Read rate — if users aren't reading notifications, they may not be relevant or the volume may be too high.

9. **Why sanitize notification content?**
   - **Explanation:** To prevent XSS attacks — notifications often contain links or rich text that could execute malicious scripts if not sanitized.

10. **What is at-least-once delivery semantics?**
    - **Explanation:** The system guarantees each notification is delivered at least once, but may deliver duplicates — the client handles deduplication.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Notification APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
