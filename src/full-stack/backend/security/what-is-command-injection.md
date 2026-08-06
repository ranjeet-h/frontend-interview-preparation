# What is command injection

## Detailed explanation

What is command injection is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is command injection by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is command injection affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is command injection?
- **The Engine Mechanism (Why it behaves this way):** Command injection is a vulnerability where an attacker injects operating system commands into a backend application that executes system commands. When user input is passed to functions like `exec()`, `spawn()`, `system()`, or backticks without proper sanitization, the attacker can append additional commands using shell metacharacters (`;`, `|`, `&&`, `$()`). This gives the attacker direct access to the server's operating system.
- **The Unforgettable Mental Model:** The **Drive-Thru Intercom**. The drive-thru (app) takes your order (user input) and passes it to the kitchen (OS command). But if you say "burger; also give me all the cash from the register" (injected command), the kitchen processes both instructions.
- **The Trap:** Thinking command injection is rare. Any feature that executes system commands (image processing, file conversion, ping tests, git operations) is vulnerable if user input is involved.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Command injection is a vulnerability where an attacker injects OS commands into a backend application that executes system commands. When user input is passed to exec(), spawn(), or system() without sanitization, the attacker can append commands using shell metacharacters like semicolons or pipes. This gives direct OS access — the most severe web vulnerability. The defense is to avoid executing system commands with user input entirely, or use safe APIs that don't invoke a shell."

#### How does command injection work?
- **The Engine Mechanism (Why it behaves this way):** Example: `exec('ping ' + userInput)`. Attacker sends `8.8.8.8; cat /etc/passwd`. The executed command becomes `ping 8.8.8.8; cat /etc/passwd` — the semicolon ends the ping command and starts a new command that reads the password file. Other metacharacters: `|` (pipe output), `&&` (chain commands), `$()` (command substitution), backticks (command substitution).
- **The Unforgettable Mental Model:** The **Sentence Terminator**. The semicolon (or other metacharacter) is like a period that ends one sentence and starts another. The attacker uses it to add their own sentence (command) to the original instruction.
- **The Trap:** Only blocking semicolons. Attackers use many metacharacters (`|`, `&&`, `$()`, backticks, newlines). Blocking individual characters is insufficient — use safe APIs instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Command injection works by appending OS commands to the intended command using shell metacharacters. For example, `exec('ping ' + userInput)` with input `8.8.8.8; cat /etc/passwd` executes both commands. Attackers use semicolons, pipes, `&&`, `$()`, backticks, and newlines. Blocking individual characters isn't sufficient — the reliable defense is to avoid shell execution entirely and use safe APIs that don't invoke a shell."

#### How do you prevent command injection?
- **The Engine Mechanism (Why it behaves this way):** Prevention: (1) Avoid executing system commands with user input — use native libraries instead (e.g., Node.js `fs` module instead of `ls`), (2) If commands are necessary, use safe APIs that don't invoke a shell (e.g., `execFile()` instead of `exec()`), (3) Validate and sanitize input with strict allowlists (only allow expected characters), (4) Never pass user input directly to shell commands, (5) Use parameterized command execution where the command and arguments are separate.
- **The Unforgettable Mental Model:** The **Assembly Line**. Instead of giving the worker a written instruction that could be modified (shell command), you give them pre-assembled parts (separate command and arguments). The worker can only assemble what you give them — they can't add their own parts.
- **The Trap:** Using "escaping" to sanitize input for shell commands. Escaping is error-prone and can be bypassed. The safe approach is to not use shell execution at all.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent command injection by avoiding system command execution with user input entirely — using native libraries instead. When commands are necessary, I use safe APIs like execFile() that don't invoke a shell, separating the command from its arguments. I validate input with strict allowlists and never pass user input directly to shell commands. Escaping is error-prone and can be bypassed — the reliable defense is to not use shell execution."

#### What would you monitor for command injection?
- **The Engine Mechanism (Why it behaves this way):** Monitor: system command execution rates, shell metacharacter detection in user input, unusual process spawning patterns, and command execution error rates. Alert on metacharacter detection in input fields and unusual process spawning (commands that shouldn't be running).
- **The Unforgettable Mental Model:** The **Command Execution Monitor**. You're watching what commands are being executed, whether user input contains dangerous characters, and whether unexpected processes are spawning.
- **The Trap:** Not monitoring process spawning. Command injection often results in unexpected processes (reverse shells, data exfiltration tools) that can be detected through process monitoring.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor command injection through system command execution rates, shell metacharacter detection in user input, unusual process spawning patterns, and command execution error rates. Process monitoring is critical — command injection often spawns unexpected processes like reverse shells or data exfiltration tools. I alert on metacharacter detection in input fields and any process spawning that doesn't match the expected application behavior."

## 8. Active recall test

1. **What is command injection?**
   - **Explanation:** A vulnerability where an attacker injects OS commands into a backend app that executes system commands, giving direct access to the server's operating system.
2. **How does command injection work?**
   - **Explanation:** User input is passed to exec()/system() without sanitization. Attacker appends commands using shell metacharacters (;, |, &&, $(), backticks) to execute arbitrary OS commands.
3. **How do you prevent command injection?**
   - **Explanation:** Avoid executing system commands with user input. Use native libraries. If needed, use safe APIs (execFile instead of exec) that don't invoke a shell. Validate with strict allowlists.
4. **Why is escaping insufficient for command injection prevention?**
   - **Explanation:** Escaping is error-prone and can be bypassed through encoding tricks, Unicode normalization, or shell-specific behavior. The reliable defense is to not use shell execution.
5. **What is the difference between exec() and execFile()?**
   - **Explanation:** exec() invokes a shell, allowing shell metacharacters to work. execFile() executes the command directly without a shell, making metacharacters inert.
6. **What are common shell metacharacters used in command injection?**
   - **Explanation:** ; (command separator), | (pipe), && (AND chain), $() (command substitution), backticks (command substitution), newline (command separator).
7. **What should you monitor for command injection?**
   - **Explanation:** System command execution rates, metacharacter detection in input, unusual process spawning, and command execution errors. Alert on unexpected processes.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is command injection in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is command injection in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
