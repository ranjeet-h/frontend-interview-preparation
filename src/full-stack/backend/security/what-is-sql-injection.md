# What is SQL injection

## Detailed explanation

What is SQL injection is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is sql injection by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is sql injection affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is SQL injection?
- **The Engine Mechanism (Why it behaves this way):** SQL injection is a vulnerability where an attacker inserts malicious SQL code into a query through user input. When user input is concatenated directly into SQL strings, the attacker can break out of the intended query structure and execute arbitrary SQL commands. This can lead to data theft, data modification, authentication bypass, and even remote code execution.
- **The Unforgettable Mental Model:** The **Mad Libs Attack**. The query template is a Mad Libs sentence: "SELECT * FROM users WHERE name = ___." If the user fills in `admin' OR '1'='1`, the sentence becomes "SELECT * FROM users WHERE name = 'admin' OR '1'='1'" — which is always true, returning all users.
- **The Trap:** Thinking SQL injection is a legacy problem. It remains one of the most critical web vulnerabilities. Any application that concatenates user input into SQL queries is vulnerable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SQL injection is a vulnerability where malicious SQL code is inserted into a query through user input. When input is concatenated into SQL strings, attackers can break out of the intended query structure and execute arbitrary SQL. This can lead to data theft, data modification, authentication bypass, and remote code execution. The defense is parameterized queries (prepared statements), which separate the query structure from the data."

#### How does SQL injection work?
- **The Engine Mechanism (Why it behaves this way):** Attack example: Login query `SELECT * FROM users WHERE email = '` + userInput + `' AND password = '` + passwordInput + `'`. Attacker enters email: `admin' --`. The query becomes `SELECT * FROM users WHERE email = 'admin' --' AND password = ''`. The `--` comments out the password check, logging in as admin without a password. More advanced attacks use UNION-based injection, blind injection, and time-based injection.
- **The Unforgettable Mental Model:** The **Sentence Breaker**. The attacker's input is like a sentence that changes the meaning of the entire paragraph. By adding a quote and a comment, they rewrite the query's logic.
- **The Trap:** Only testing for basic `' OR '1'='1` injection. Advanced SQL injection uses UNION, blind, and time-based techniques that are harder to detect but equally dangerous.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SQL injection works by breaking out of the intended query structure through user input. For example, entering `admin' --` in a login field comments out the password check, bypassing authentication. More advanced attacks use UNION to extract data from other tables, blind injection to infer data through true/false responses, and time-based injection to extract data through response delays. The root cause is always string concatenation of user input into SQL queries."

#### How do parameterized queries prevent SQL injection?
- **The Engine Mechanism (Why it behaves this way):** Parameterized queries (prepared statements) separate the SQL query structure from the data. The database parses and compiles the query template first, then binds user input as parameters. The database treats parameters as data, never as executable SQL. Even if the input contains SQL syntax, it's treated as a literal value, not as part of the query structure.
- **The Unforgettable Mental Model:** The **Form vs. Essay**. Concatenation is like letting someone write directly into your essay (they can change the meaning). Parameterized queries are like filling out a form — the structure is fixed, and the input goes into designated fields that can't change the structure.
- **The Trap:** Using string interpolation with "sanitized" input instead of parameterized queries. Sanitization can be bypassed; parameterized queries are the only reliable defense.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Parameterized queries prevent SQL injection by separating the query structure from the data. The database parses the query template first, then binds user input as parameters. Parameters are always treated as data, never as executable SQL. Even if the input contains SQL syntax like `' OR '1'='1`, it's treated as a literal string value. I always use parameterized queries — never string concatenation or interpolation — for any SQL that includes user input."

#### What are the types of SQL injection?
- **The Engine Mechanism (Why it behaves this way):** Types: (1) In-band (classic) — attacker uses the same channel for injection and data extraction (UNION-based, error-based), (2) Blind — attacker infers data through true/false responses (boolean-based) or response delays (time-based), (3) Out-of-band — attacker uses a different channel (DNS, HTTP) to extract data. Blind and out-of-band are harder to detect but equally dangerous.
- **The Unforgettable Mental Model:** **Direct vs. Indirect vs. Side Channel**. In-band is like reading the answer directly on the test paper. Blind is like asking yes/no questions to figure out the answer. Out-of-band is like having someone text you the answer from another room.
- **The Trap:** Only protecting against in-band SQL injection. Blind injection doesn't return data directly, so it's harder to detect but still extracts data through inference.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SQL injection has three main types. In-band uses the same channel for injection and data extraction — UNION-based and error-based. Blind infers data through true/false responses or response delays — harder to detect but equally dangerous. Out-of-band uses a different channel like DNS or HTTP to extract data. All types are prevented by parameterized queries — the defense is the same regardless of the attack vector."

#### How does SQL injection affect the backend?
- **The Engine Mechanism (Why it behaves this way):** SQL injection impacts the backend through: data breaches (attacker reads sensitive data), data modification (attacker updates or deletes data), authentication bypass (attacker logs in as any user), and remote code execution (some databases allow OS command execution). The backend must use parameterized queries, input validation, least-privilege database accounts, and error handling that doesn't leak database details.
- **The Unforgettable Mental Model:** The **Master Key**. SQL injection gives the attacker a master key to the database — they can read, modify, delete, and sometimes execute commands on the server. The backend must ensure no single input can become a master key.
- **The Trap:** Using a database account with excessive privileges. If the app's database account has DROP TABLE or EXEC permissions, SQL injection can cause catastrophic damage. Use least-privilege accounts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SQL injection can lead to data breaches, data modification, authentication bypass, and even remote code execution. The backend defends with parameterized queries as the primary defense, input validation as a secondary layer, least-privilege database accounts to limit damage, and error handling that doesn't leak database details. I never use the app's database account with admin privileges — it should only have the permissions needed for its specific operations."

#### What would you monitor for SQL injection?
- **The Engine Mechanism (Why it behaves this way):** Monitor: database error rates (SQL syntax errors indicate injection attempts), unusual query patterns (UNION, SELECT, DROP in user input), response time anomalies (time-based injection), and WAF (Web Application Firewall) block rates. Alert on SQL injection patterns in input and unusual database error spikes.
- **The Unforgettable Mental Model:** The **Database Security Monitor**. You're watching for suspicious input patterns (SQL keywords in user data), database errors (syntax errors from injection), and response time anomalies (time-based attacks).
- **The Trap:** Not monitoring database error rates. SQL injection attempts often cause syntax errors that are logged by the database. These errors are the earliest indicator of injection attempts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor SQL injection through database error rates (syntax errors indicate injection attempts), unusual query patterns in user input (SQL keywords), response time anomalies (time-based injection), and WAF block rates. Database error logs are the most valuable signal — injection attempts often cause syntax errors. I also monitor for SQL keywords in user input fields and alert on unusual patterns. All injection attempts are logged for security investigation."

## 8. Active recall test

1. **What is SQL injection?**
   - **Explanation:** A vulnerability where malicious SQL code is inserted into a query through user input, enabling data theft, modification, authentication bypass, and remote code execution.
2. **How does SQL injection work?**
   - **Explanation:** User input is concatenated into SQL strings. Attacker input breaks out of the intended query structure (e.g., `admin' --` comments out password check) and executes arbitrary SQL.
3. **How do parameterized queries prevent SQL injection?**
   - **Explanation:** They separate query structure from data. The database parses the query template first, then binds input as parameters. Parameters are always treated as data, never as executable SQL.
4. **What are the types of SQL injection?**
   - **Explanation:** In-band (UNION, error-based), Blind (boolean-based, time-based), and Out-of-band (DNS, HTTP channels). All prevented by parameterized queries.
5. **Why is least-privilege database access important for SQL injection?**
   - **Explanation:** If the app's database account has excessive privileges (DROP, EXEC), SQL injection can cause catastrophic damage. Least-privilege limits what an attacker can do even if injection succeeds.
6. **What should you never do with user input and SQL?**
   - **Explanation:** Never concatenate or interpolate user input directly into SQL strings. Always use parameterized queries (prepared statements).
7. **What should you monitor for SQL injection?**
   - **Explanation:** Database error rates (syntax errors), SQL keywords in user input, response time anomalies (time-based injection), and WAF block rates.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is SQL injection in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is SQL injection in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
