# What is prototype pollution

## Detailed explanation

What is prototype pollution is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is prototype pollution by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is prototype pollution affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is prototype pollution?
- **The Engine Mechanism (Why it behaves this way):** Prototype pollution is a JavaScript vulnerability where an attacker injects properties into Object.prototype, affecting all objects in the application. Since JavaScript objects inherit from Object.prototype by default, polluting it adds properties to every object. This can lead to denial of service, property injection, and in some cases, remote code execution. It occurs when user input is used in recursive object merge or property assignment operations without checking for prototype keys like `__proto__`, `constructor`, or `prototype`.
- **The Unforgettable Mental Model:** The **Contaminated Water Supply**. Object.prototype is the water supply for all objects. If an attacker contaminates it (adds malicious properties), every object that drinks from it (inherits from it) is affected.
- **The Trap:** Thinking prototype pollution only affects frontend JavaScript. It's equally dangerous in Node.js backends, where it can lead to remote code execution through property injection in Express, database queries, or template engines.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Prototype pollution is a JavaScript vulnerability where an attacker injects properties into Object.prototype, affecting all objects in the application. Since all objects inherit from Object.prototype, polluting it adds properties to every object. It occurs when user input is used in recursive object merge or property assignment without checking for prototype keys like __proto__, constructor, or prototype. In Node.js backends, it can lead to denial of service, property injection, and remote code execution."

#### How does prototype pollution work?
- **The Engine Mechanism (Why it behaves this way):** Example: `merge({}, userInput)` where userInput is `{"__proto__": {"isAdmin": true}}`. The merge function recursively assigns properties, including `__proto__`, which modifies Object.prototype. Now every object has `isAdmin: true`. More dangerous attacks pollute `constructor.prototype` to inject properties into function prototypes, or pollute `toString`/`valueOf` to change object behavior.
- **The Unforgettable Mental Model:** The **Universal Template**. Every object is printed from a universal template (Object.prototype). If the attacker modifies the template, every printed object gets the modification. It's like changing the master copy that all photocopies are made from.
- **The Trap**: Only checking for `__proto__` while ignoring `constructor` and `prototype`. Attackers can use `constructor.prototype` to achieve the same effect.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Prototype pollution works by injecting properties into Object.prototype through unsafe object merge or property assignment. For example, `merge({}, {'__proto__': {'isAdmin': true}})` adds isAdmin to every object. Attackers can also use `constructor.prototype` to bypass __proto__ checks. The impact ranges from denial of service (polluting toString) to privilege escalation (polluting isAdmin) to remote code execution (polluting properties used in eval or template engines)."

#### How do you prevent prototype pollution?
- **The Engine Mechanism (Why it behaves this way):** Prevention: (1) Use `Object.create(null)` for objects that shouldn't inherit from Object.prototype, (2) Validate and sanitize input — reject keys like `__proto__`, `constructor`, `prototype`, (3) Use safe merge libraries that check for prototype keys, (4) Freeze Object.prototype with `Object.freeze(Object.prototype)` to prevent modification, (5) Use Map instead of plain objects for user-controlled data, (6) Keep dependencies updated — many prototype pollution vulnerabilities are in third-party libraries.
- **The Unforgettable Mental Model:** The **Template Lock**. You put a lock on the universal template (Object.prototype.freeze) so no one can modify it. You also check every input for template modification attempts (key validation) and use custom templates (Object.create(null)) for user data.
- **The Trap**: Only freezing Object.prototype without fixing the root cause. Freezing is defense-in-depth — the real fix is to sanitize input and use safe merge operations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent prototype pollution by sanitizing input — rejecting keys like __proto__, constructor, and prototype. I use safe merge libraries that check for prototype keys, and I use Object.create(null) for objects that shouldn't inherit from Object.prototype. As defense-in-depth, I freeze Object.prototype with Object.freeze(). I also keep dependencies updated, as many prototype pollution vulnerabilities are in third-party libraries like lodash and express."

#### What would you monitor for prototype pollution?
- **The Engine Mechanism (Why it behaves this way):** Monitor: unexpected object properties (isAdmin, toString modifications on objects that shouldn't have them), application crashes (DoS from prototype pollution), dependency vulnerability alerts (CVEs for prototype pollution in dependencies), and unusual object behavior (changed toString, valueOf, or hasOwnProperty). Alert on dependency vulnerabilities and unexpected object property modifications.
- **The Unforgettable Mental Model:** The **Object Health Monitor**. You're watching whether objects have unexpected properties (pollution indicators), whether the application is crashing (DoS), and whether dependencies have known vulnerabilities.
- **The Trap**: Not monitoring dependency vulnerabilities. Prototype pollution is most commonly introduced through vulnerable third-party libraries, not direct code.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor prototype pollution through unexpected object properties (isAdmin, toString modifications on objects that shouldn't have them), application crashes (DoS), dependency vulnerability alerts, and unusual object behavior. Dependency monitoring is critical — prototype pollution is most commonly introduced through vulnerable third-party libraries. I also run automated tests that check for prototype pollution in merge operations and object assignment patterns."

## 8. Active recall test

1. **What is prototype pollution?**
   - **Explanation:** A JavaScript vulnerability where an attacker injects properties into Object.prototype, affecting all objects in the application through prototype inheritance.
2. **How does prototype pollution work?**
   - **Explanation:** User input with keys like __proto__ or constructor is used in recursive object merge/assignment. This modifies Object.prototype, adding properties to every object that inherits from it.
3. **How do you prevent prototype pollution?**
   - **Explanation:** Sanitize input (reject __proto__, constructor, prototype keys), use safe merge libraries, use Object.create(null) for user data, freeze Object.prototype, use Map instead of objects, keep dependencies updated.
4. **Why is Object.freeze(Object.prototype) useful?**
   - **Explanation:** It prevents modification of Object.prototype, blocking prototype pollution attempts. It's defense-in-depth — the real fix is input sanitization and safe merge operations.
5. **What keys should you reject to prevent prototype pollution?**
   - **Explanation:** __proto__, constructor, prototype. These are the prototype chain keys that can be used to modify Object.prototype.
6. **Why is prototype pollution dangerous in Node.js backends?**
   - **Explanation:** It can lead to denial of service (crashing the app), property injection (isAdmin: true on all objects), and remote code execution (polluting properties used in eval or template engines).
7. **What should you monitor for prototype pollution?**
   - **Explanation:** Unexpected object properties, application crashes, dependency vulnerability alerts, and unusual object behavior. Dependency monitoring is critical — most vulnerabilities come from third-party libraries.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is prototype pollution in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is prototype pollution in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
