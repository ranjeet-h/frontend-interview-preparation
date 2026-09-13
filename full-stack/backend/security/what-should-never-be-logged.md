# What should never be logged

## Detailed explanation

What should never be logged is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what should never be logged by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what should never be logged affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What should never be logged?
- **The Engine Mechanism (Why it behaves this way):** Sensitive data must never appear in logs: passwords, access tokens, refresh tokens, session IDs, API keys, credit card numbers, SSN, health data, PII (personally identifiable information), and security answers. Logs are often accessible to many team members, sent to third-party services, and stored for long periods — making them a prime target for data theft. Sensitive data in logs violates compliance requirements (PCI-DSS, HIPAA, GDPR) and creates security risks.
- **The Unforgettable Mental Model:** The **Public Bulletin Board**. Logs are like a public bulletin board — many people can read them, they're archived for a long time, and they're often shared with external services. You wouldn't pin your password or credit card on a public board.
- **The Trap**: Logging request bodies for debugging without filtering sensitive fields. Debug logs often capture entire request objects, including passwords and tokens. Always filter sensitive fields before logging.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Sensitive data must never be logged — passwords, tokens, session IDs, API keys, credit card numbers, SSN, health data, and PII. Logs are accessible to many team members, sent to third-party services, and stored long-term, making them a prime target for data theft. I implement log filtering at the application level to redact sensitive fields before they reach the logging system. I also use structured logging with explicit field allowlists to ensure only safe data is logged."

#### What are the categories of sensitive data that must not be logged?
- **The Engine Mechanism (Why it behaves this way):** Categories: (1) Authentication data — passwords, tokens, session IDs, API keys, (2) Financial data — credit card numbers, bank account numbers, CVV, (3) Personal data — SSN, passport numbers, health data, biometric data, (4) Security data — security questions, MFA codes, encryption keys, (5) Business secrets — proprietary algorithms, trade secrets, internal API endpoints. Each category has specific compliance requirements (PCI-DSS for financial, HIPAA for health, GDPR for personal).
- **The Unforgettable Mental Model:** The **Redacted Document**. Each category is a section that must be blacked out (redacted) before the document (log) is shared. The redaction rules are different for each section but the principle is the same — sensitive content must not be visible.
- **The Trap**: Only filtering passwords while logging other sensitive data. Tokens, session IDs, and API keys are equally sensitive and must be filtered.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Sensitive data falls into categories: authentication data (passwords, tokens, session IDs, API keys), financial data (credit cards, bank accounts), personal data (SSN, health data, PII), security data (MFA codes, encryption keys), and business secrets. Each has specific compliance requirements. I filter all categories — not just passwords. Tokens and session IDs are equally sensitive because they grant access. I use structured logging with explicit field allowlists to ensure only safe data is logged."

#### How do you implement log filtering?
- **The Engine Mechanism (Why it behaves this way):** Log filtering is implemented at the application level before data reaches the logging system. Techniques: (1) Structured logging with field allowlists — only explicitly allowed fields are logged, (2) Redaction middleware — intercepts log entries and redacts sensitive fields (password, token, authorization header), (3) Custom serializers — objects are serialized with sensitive fields masked (****), (4) Log sanitization libraries — automatically detect and redact patterns like credit card numbers, SSN, and tokens.
- **The Unforgettable Mental Model:** The **Water Filter**. Before water (log data) reaches the reservoir (log storage), it passes through a filter that removes contaminants (sensitive data). Only clean water reaches the reservoir.
- **The Trap**: Filtering at the log storage level instead of the application level. By the time data reaches storage, it may have already been transmitted over the network or written to intermediate buffers. Filter at the source.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement log filtering at the application level before data reaches the logging system. I use structured logging with field allowlists — only explicitly allowed fields are logged. I also use redaction middleware that intercepts log entries and masks sensitive fields like password, token, and authorization headers. Custom serializers mask sensitive fields in object serialization. The key is filtering at the source — by the time data reaches log storage, it should already be clean."

#### What would you monitor for log security?
- **The Engine Mechanism (Why it behaves this way):** Monitor: sensitive data detection in logs (automated scanning for passwords, tokens, credit cards), log access patterns (who is accessing logs and when), log retention compliance (logs deleted after required period), and log filtering effectiveness (verify sensitive fields are being redacted). Alert on sensitive data detected in logs and unauthorized log access.
- **The Unforgettable Mental Model:** The **Log Security Scanner**. You're continuously scanning logs for sensitive data that slipped through, watching who's accessing the logs, and verifying the filtering is working correctly.
- **The Trap**: Not monitoring log access. Logs contain valuable operational data — who accessed what and when. Unauthorized log access can indicate insider threats or compromised accounts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor log security through automated sensitive data detection in logs (scanning for passwords, tokens, credit cards), log access patterns (who's accessing logs), log retention compliance, and log filtering effectiveness verification. I alert on sensitive data detected in logs — this indicates a filtering failure. I also monitor log access for unauthorized patterns. Regular log audits ensure compliance with PCI-DSS, HIPAA, and GDPR requirements."

## 8. Active recall test

1. **What should never be logged?**
   - **Explanation:** Passwords, tokens, session IDs, API keys, credit card numbers, SSN, health data, PII, MFA codes, encryption keys, and business secrets. Logs are widely accessible and long-term storage.
2. **What are the categories of sensitive data?**
   - **Explanation:** Authentication data (passwords, tokens), financial data (credit cards), personal data (SSN, health), security data (MFA codes, keys), and business secrets. Each has compliance requirements.
3. **How do you implement log filtering?**
   - **Explanation:** At the application level: structured logging with field allowlists, redaction middleware, custom serializers that mask sensitive fields, and log sanitization libraries. Filter at the source.
4. **Why filter at the application level, not storage level?**
   - **Explanation:** By the time data reaches storage, it may have been transmitted over the network or written to intermediate buffers. Filtering at the source ensures sensitive data never leaves the application.
5. **What is structured logging with field allowlists?**
   - **Explanation:** Only explicitly allowed fields are logged. Instead of logging entire objects, you specify which fields are safe. Everything else is excluded by default.
6. **Why are tokens and session IDs as sensitive as passwords?**
   - **Explanation:** They grant access to authenticated sessions. A stolen token or session ID is equivalent to a stolen password — it gives the attacker full access to the user's account.
7. **What should you monitor for log security?**
   - **Explanation:** Sensitive data detection in logs, log access patterns, log retention compliance, and filtering effectiveness. Alert on sensitive data detected and unauthorized log access.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What should never be logged in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What should never be logged in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
