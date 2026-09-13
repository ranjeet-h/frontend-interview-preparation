# What is path traversal

## Detailed explanation

What is path traversal is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is path traversal by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is path traversal affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is path traversal?
- **The Engine Mechanism (Why it behaves this way):** Path traversal (directory traversal) is a vulnerability where an attacker manipulates file path inputs to access files outside the intended directory. By using `../` sequences (or OS-specific equivalents), the attacker navigates up the directory tree to access sensitive files like `/etc/passwd`, configuration files, or source code. The vulnerability occurs when user-supplied file paths are used directly without validation or sanitization.
- **The Unforgettable Mental Model:** The **Hotel Floor Elevator**. The guest (user input) is only supposed to access their floor (intended directory). But by pressing the "up" button repeatedly (`../../../`), they reach the penthouse (system files) where they shouldn't have access.
- **The Trap:** Only blocking `../` sequences. Attackers use encoded variants (`%2e%2e%2f`), double-encoding, OS-specific paths (`..\` on Windows), and null bytes (`%00`) to bypass simple filters.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Path traversal is a vulnerability where an attacker manipulates file path inputs to access files outside the intended directory. Using `../` sequences, they navigate up the directory tree to access sensitive files like /etc/passwd or configuration files. The vulnerability occurs when user-supplied paths are used directly without validation. The defense is to validate paths against an allowlist, resolve the canonical path, and verify it stays within the intended directory."

#### How does path traversal work?
- **The Engine Mechanism (Why it behaves this way):** Example: File download endpoint `res.sendFile('/uploads/' + userInput)`. Attacker sends `../../etc/passwd`. The resolved path becomes `/uploads/../../etc/passwd` = `/etc/passwd`. The server reads and returns the system password file. Attackers also use URL encoding (`%2e%2e%2f`), double-encoding, and null byte injection (`file.pdf%00.jpg`) to bypass filters.
- **The Unforgettable Mental Model:** The **Backdoor Staircase**. The building has a staircase (../) that goes up to each floor. The attacker uses it to reach floors they shouldn't access. Even if the main entrance is guarded (input validation), the staircase is still there.
- **The Trap:** Using string replacement to remove `../` from input. Attackers can use `....//` which becomes `../` after one replacement pass. Multiple passes or canonical path resolution is needed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Path traversal works by using `../` sequences to navigate outside the intended directory. For example, a file download endpoint that concatenates user input with a base path can be tricked into reading `/etc/passwd` by sending `../../etc/passwd`. Attackers bypass simple filters using URL encoding, double-encoding, OS-specific paths, and null bytes. The defense is to resolve the canonical path and verify it stays within the allowed directory."

#### How do you prevent path traversal?
- **The Engine Mechanism (Why it behaves this way):** Prevention: (1) Use an allowlist of permitted files or directories instead of accepting arbitrary paths, (2) Resolve the canonical (absolute) path using `path.resolve()` and verify it starts with the intended base directory, (3) Strip or reject `../` sequences and encoded variants, (4) Use file IDs instead of file names (map ID to path server-side), (5) Set proper file system permissions to restrict access to sensitive files.
- **The Unforgettable Mental Model:** The **Geofence**. Instead of checking whether each step is valid, you check whether the final destination is within the allowed area (base directory). If the resolved path is outside the geofence, reject it.
- **The Trap:** Only checking for `../` in the raw input without resolving the canonical path. Encoded and obfuscated traversal sequences can bypass string-based checks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent path traversal by resolving the canonical path and verifying it stays within the intended base directory. I use path.resolve() to get the absolute path, then check that it starts with the allowed base path. I also prefer file IDs over file names — the server maps IDs to paths, so the user never controls the path directly. Allowlists of permitted files are the safest approach. I also set proper file system permissions as defense-in-depth."

#### What would you monitor for path traversal?
- **The Engine Mechanism (Why it behaves this way):** Monitor: file access patterns (requests for files outside expected directories), path traversal pattern detection (`../`, encoded variants) in user input, file system error rates (permission denied, file not found for sensitive paths), and unusual file download patterns. Alert on traversal pattern detection and access attempts to sensitive files.
- **The Unforgettable Mental Model:** The **File Access Monitor**. You're watching which files are being accessed, whether input contains traversal patterns, and whether anyone is trying to reach restricted areas.
- **The Trap:** Not monitoring file access patterns. Path traversal attempts often target specific sensitive files (/etc/passwd, .env, web.config) that can be detected through access pattern monitoring.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor path traversal through file access patterns (requests for files outside expected directories), traversal pattern detection in user input (`../`, encoded variants), file system error rates, and unusual download patterns. I alert on access attempts to sensitive files like /etc/passwd, .env, or configuration files. Path traversal attempts are logged with full input context for security investigation."

## 8. Active recall test

1. **What is path traversal?**
   - **Explanation:** A vulnerability where an attacker manipulates file path inputs using ../ sequences to access files outside the intended directory, potentially reading sensitive system files.
2. **How does path traversal work?**
   - **Explanation:** User input is concatenated with a base path. Attacker sends ../../etc/passwd, which resolves to /etc/passwd. Server reads and returns the sensitive file.
3. **How do you prevent path traversal?**
   - **Explanation:** Resolve canonical path (path.resolve), verify it starts with the allowed base directory. Use file IDs instead of file names. Use allowlists of permitted files.
4. **Why is string replacement insufficient for preventing path traversal?**
   - **Explanation:** Attackers use encoded variants (%2e%2e%2f), double-encoding, OS-specific paths (..\), and tricks like ....// that become ../ after one replacement. Canonical path resolution is needed.
5. **What is a canonical path?**
   - **Explanation:** The absolute, resolved path with all ../ and ./ sequences resolved. path.resolve('/uploads/../../etc/passwd') returns '/etc/passwd'.
6. **Why are file IDs safer than file names?**
   - **Explanation:** The server maps IDs to paths internally. The user never controls the path directly, eliminating path traversal risk entirely.
7. **What should you monitor for path traversal?**
   - **Explanation:** File access patterns, traversal patterns in input (../, encoded variants), file system errors, and access attempts to sensitive files (/etc/passwd, .env).

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is path traversal in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is path traversal in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
