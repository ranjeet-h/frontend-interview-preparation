# Backend Questions

Imported from `Backend_Questions.csv`. Exact duplicate prompts were removed during generation.

## Question index

| # | Skill | Questions |
|---|---|---|
| 1 | [Language Fundamentals (Java/Python/Node.js) – variables, data types, memory management, pass by value/reference, garbage collection](#1-language-fundamentals-java-python-node-js-variables-data-types-memory-management-pass-by-value-reference-garbage-collection) | 5 |
| 2 | [OOP Concepts – classes, inheritance, polymorphism, encapsulation, abstraction, SOLID principles](#2-oop-concepts-classes-inheritance-polymorphism-encapsulation-abstraction-solid-principles) | 5 |
| 3 | [Data Structures – arrays, linked lists, stacks, queues, trees, graphs, hash tables](#3-data-structures-arrays-linked-lists-stacks-queues-trees-graphs-hash-tables) | 5 |
| 4 | [Algorithms – sorting, searching, recursion, dynamic programming, greedy algorithms, complexity analysis](#4-algorithms-sorting-searching-recursion-dynamic-programming-greedy-algorithms-complexity-analysis) | 5 |
| 5 | [Database Design – normalization, ER diagrams, relationships, constraints, indexes, query optimization](#5-database-design-normalization-er-diagrams-relationships-constraints-indexes-query-optimization) | 5 |
| 6 | [SQL – SELECT, JOINs, aggregation, subqueries, window functions, transactions](#6-sql-select-joins-aggregation-subqueries-window-functions-transactions) | 5 |
| 7 | [NoSQL – document databases, key-value stores, eventual consistency, CAP theorem, MongoDB basics](#7-nosql-document-databases-key-value-stores-eventual-consistency-cap-theorem-mongodb-basics) | 5 |
| 8 | [REST API Design – HTTP methods, status codes, versioning, pagination, filtering, error handling](#8-rest-api-design-http-methods-status-codes-versioning-pagination-filtering-error-handling) | 5 |
| 9 | [Authentication & Authorization – JWT, OAuth, session-based auth, password hashing, token refresh](#9-authentication-authorization-jwt-oauth-session-based-auth-password-hashing-token-refresh) | 5 |
| 10 | [Security – SQL injection, XSS, CSRF, encryption, SSL/TLS, secrets management](#10-security-sql-injection-xss-csrf-encryption-ssl-tls-secrets-management) | 5 |
| 11 | [Caching – in-memory caching, Redis, cache invalidation, cache patterns, TTL](#11-caching-in-memory-caching-redis-cache-invalidation-cache-patterns-ttl) | 5 |
| 12 | [Concurrency & Threading – threads, locks, deadlocks, race conditions, thread safety, async/await](#12-concurrency-threading-threads-locks-deadlocks-race-conditions-thread-safety-async-await) | 5 |
| 13 | [Microservices – service decomposition, communication, API gateway, service discovery, load balancing](#13-microservices-service-decomposition-communication-api-gateway-service-discovery-load-balancing) | 5 |
| 14 | [Message Queues – event streaming, pub-sub, message ordering, RabbitMQ, Kafka, dead letter queues](#14-message-queues-event-streaming-pub-sub-message-ordering-rabbitmq-kafka-dead-letter-queues) | 5 |
| 15 | [System Design – scaling, availability, consistency, monitoring, capacity planning](#15-system-design-scaling-availability-consistency-monitoring-capacity-planning) | 5 |
| 16 | [Deployment & DevOps – CI/CD, containerization, Docker, Kubernetes, logging, monitoring](#16-deployment-devops-ci-cd-containerization-docker-kubernetes-logging-monitoring) | 5 |
| 17 | [Design Patterns – Singleton, Factory, Observer, Strategy, Decorator, Repository Pattern](#17-design-patterns-singleton-factory-observer-strategy-decorator-repository-pattern) | 5 |
| 18 | [Testing – unit tests, integration tests, mocking, test coverage, TDD](#18-testing-unit-tests-integration-tests-mocking-test-coverage-tdd) | 5 |
| 19 | [Code Quality & Performance – code reviews, documentation, profiling, bottleneck identification](#19-code-quality-performance-code-reviews-documentation-profiling-bottleneck-identification) | 5 |
| 20 | [Cloud Services – AWS, GCP, Azure basics, services, scaling, deployment](#20-cloud-services-aws-gcp-azure-basics-services-scaling-deployment) | 5 |

---

## 1. Language Fundamentals (Java/Python/Node.js) – variables, data types, memory management, pass by value/reference, garbage collection

1. Explain pass by value vs pass by reference with examples
2. What is garbage collection and how does it work?
3. Explain memory management in your language
4. What are primitive vs object types?
5. Explain type coercion and type casting

---

### Q1. Explain pass by value vs pass by reference with examples

**Answer:** Pass by value copies the actual value, while pass by reference passes a reference to the original object.

**Explanation:** In JavaScript, primitives are passed by value, so changes inside a function don't affect the original. Objects are passed by reference, so mutations inside a function affect the original object. Java always passes arguments by value, but for objects, the value is a reference. Python passes references to objects, but the reference itself is passed by value.

**Example:**
```js
function foo(x) { x = 5; }
let a = 3; foo(a); // a is still 3
function bar(obj) { obj.val = 5; }
let o = {val: 3}; bar(o); // o.val is now 5
```

**Interview Takeaway:** Know how mutation and assignment differ for primitives vs objects in your language.

### Q2. What is garbage collection and how does it work?

**Answer:** Garbage collection automatically frees memory that is no longer reachable by the program.

**Explanation:** Most modern languages use tracing garbage collectors, which periodically find objects that are no longer referenced and reclaim their memory. Common algorithms include mark-and-sweep and generational collection. This helps prevent memory leaks but can introduce pauses.

**Example:** In Java, objects with no references are collected by the JVM's GC. In Python, reference counting and a cyclic GC are used.

**Interview Takeaway:** Understand how your language's GC works and when memory leaks can still occur.

### Q3. Explain memory management in your language

**Answer:** Memory management involves allocating, using, and releasing memory for variables and objects.

**Explanation:** In managed languages (Java, Python, JS), memory is allocated on the stack for local variables and on the heap for objects. The runtime handles deallocation via garbage collection. Manual memory management (like in C/C++) requires explicit allocation and freeing.

**Example:** In Java, `new` allocates heap memory; local variables are on the stack.

**Interview Takeaway:** Know the difference between stack and heap, and how leaks can still happen in managed languages.

### Q4. What are primitive vs object types?

**Answer:** Primitives are basic, immutable data types; objects are complex, mutable structures.

**Explanation:** Primitives include numbers, booleans, and strings (in JS, Java, Python). Objects can have properties and methods, and are passed by reference. Primitives are faster and use less memory, but lack methods and identity.

**Example:** In JS: `let x = 5;` (primitive), `let o = {a: 1}` (object).

**Interview Takeaway:** Distinguish between value types and reference types for mutation and performance.

### Q5. Explain type coercion and type casting

**Answer:** Type coercion is implicit conversion; type casting is explicit conversion between types.

**Explanation:** JavaScript does implicit coercion (e.g., `'5' - 1` becomes `4`), which can cause bugs. Java and Python require explicit casting, making code safer. Coercion can be convenient but is risky in critical backend code.

**Example:** JS: `Number('5')` (casting), `'5' + 1` (coercion to string).

**Interview Takeaway:** Be explicit with type conversions to avoid subtle bugs, especially in backend systems.


## 2. OOP Concepts – classes, inheritance, polymorphism, encapsulation, abstraction, SOLID principles

1. Explain inheritance and its types
2. What is polymorphism and why is it useful?
3. Explain encapsulation with example
4. What are SOLID principles?
5. How would you design a class hierarchy?

---

### Q1. Explain inheritance and its types

**Answer:** Inheritance allows a class to acquire properties and methods from another class, supporting code reuse.

**Explanation:** There are single, multiple (not in Java), multilevel, hierarchical, and hybrid inheritance. Most OOP languages support single and multilevel inheritance. Inheritance helps avoid code duplication but can lead to tight coupling and complex hierarchies if overused.

**Example:**
```java
class Animal {}
class Dog extends Animal {}
```

**Interview Takeaway:** Use inheritance for "is-a" relationships, but prefer composition for flexibility.

### Q2. What is polymorphism and why is it useful?

**Answer:** Polymorphism lets the same interface be used for different underlying forms (data types).

**Explanation:** It enables objects of different classes to be treated as instances of a common superclass, allowing for flexible and extensible code. There are compile-time (method overloading) and runtime (method overriding) polymorphism.

**Example:**
```python
def draw(shape): shape.draw()
```

**Interview Takeaway:** Polymorphism enables extensibility and cleaner code by decoupling interface from implementation.

### Q3. Explain encapsulation with example

**Answer:** Encapsulation hides internal state and requires all interaction to occur through methods.

**Explanation:** It protects object integrity by preventing external code from directly accessing or modifying internal data. This is achieved using access modifiers (private, protected, public).

**Example:**
```java
class User { private String name; public String getName() { return name; } }
```

**Interview Takeaway:** Encapsulation enforces invariants and makes code safer and easier to maintain.

### Q4. What are SOLID principles?

**Answer:** SOLID is a set of five design principles for writing maintainable OOP code.

**Explanation:** They are: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion. These principles help reduce coupling, increase cohesion, and make code easier to test and extend.

**Example:**
- SRP: Each class has one job.
- OCP: Classes are open for extension, closed for modification.

**Interview Takeaway:** Apply SOLID to keep codebases flexible and robust as requirements change.

### Q5. How would you design a class hierarchy?

**Answer:** Start with common abstractions, use interfaces for shared behavior, and prefer composition over deep inheritance.

**Explanation:** Identify "is-a" and "has-a" relationships, keep hierarchies shallow, and extract interfaces for shared contracts. Avoid deep or rigid trees that make change difficult.

**Example:**
- Animal (base class), Dog and Cat (subclasses), PetOwner (composition).

**Interview Takeaway:** Good hierarchies are simple, flexible, and easy to extend or refactor.


## 3. Data Structures – arrays, linked lists, stacks, queues, trees, graphs, hash tables

1. When would you use LinkedList vs ArrayList?
2. Explain binary search tree properties
3. What is hash collision and how to handle it?
4. Explain stack vs queue use cases
5. How do you traverse a graph?

---

### Q1. When would you use LinkedList vs ArrayList?

**Answer:** Use LinkedList for frequent insertions/deletions; use ArrayList for fast random access and iteration.

**Explanation:** LinkedLists excel at O(1) insert/delete at known positions but are slow for random access (O(n)). ArrayLists provide O(1) access and are cache-friendly, but inserts/deletes (except at the end) are O(n).

**Example:**
- LinkedList: implementing a queue.
- ArrayList: storing a list of items for fast lookup by index.

**Interview Takeaway:** Choose based on access and mutation patterns, not habit.

### Q2. Explain binary search tree properties

**Answer:** In a BST, each node's left child is less than the node, and the right child is greater.

**Explanation:** This property enables efficient O(log n) search, insert, and delete if the tree is balanced. Unbalanced BSTs can degrade to O(n) operations.

**Example:**
- Insert 5, 3, 7: 3 left of 5, 7 right of 5.

**Interview Takeaway:** Balanced BSTs are key for performance; know when to use AVL/Red-Black trees.

### Q3. What is hash collision and how to handle it?

**Answer:** A hash collision occurs when two keys hash to the same index; handle it with chaining or open addressing.

**Explanation:** Chaining uses linked lists at each bucket; open addressing finds another slot. Good hash functions and resizing reduce collision frequency.

**Example:**
- Python dict uses open addressing; Java HashMap uses chaining.

**Interview Takeaway:** Explain both collision handling and the importance of a good hash function.

### Q4. Explain stack vs queue use cases

**Answer:** Stack is LIFO (last-in, first-out); queue is FIFO (first-in, first-out).

**Explanation:** Stacks are used for undo, parsing, and recursion. Queues are used for scheduling, buffering, and breadth-first search.

**Example:**
- Stack: function call stack.
- Queue: print job scheduling.

**Interview Takeaway:** Match the structure to the problem's order of operations.

### Q5. How do you traverse a graph?

**Answer:** Use BFS for level-order traversal and shortest paths; use DFS for reachability and cycle detection.

**Explanation:** BFS uses a queue and explores neighbors level by level. DFS uses a stack (or recursion) and explores as deep as possible before backtracking.

**Example:**
- BFS: shortest path in unweighted graph.
- DFS: topological sort.

**Interview Takeaway:** Choose traversal based on the problem's requirements (e.g., shortest path vs full exploration).


## 4. Algorithms – sorting, searching, recursion, dynamic programming, greedy algorithms, complexity analysis

1. What is time complexity and space complexity?
2. Explain Big O notation with examples
3. What is recursion and when to avoid it?
4. Explain quick sort vs merge sort
5. What is dynamic programming approach?

---

### Q1. What is time complexity and space complexity?

**Answer:** Time complexity measures how algorithm runtime grows with input size; space complexity measures extra memory used.

**Explanation:** Both are expressed in Big O notation. Time complexity helps predict performance as data grows, while space complexity is crucial for memory-constrained systems. Always consider both for backend scalability.

**Example:**
- Linear search: O(n) time, O(1) space.

**Interview Takeaway:** State both complexities for any algorithm you discuss.

### Q2. Explain Big O notation with examples

**Answer:** Big O describes the upper bound of an algorithm's growth rate as input size increases.

**Explanation:** It abstracts away constants and lower-order terms, focusing on dominant factors. Common complexities: O(1), O(log n), O(n), O(n log n), O(n²).

**Example:**
- Binary search: O(log n).
- Bubble sort: O(n²).

**Interview Takeaway:** Use Big O to compare algorithms and justify your choices.

### Q3. What is recursion and when to avoid it?

**Answer:** Recursion is when a function calls itself to solve subproblems; avoid it when stack overflow or inefficiency is likely.

**Explanation:** Recursion is elegant for problems like tree traversal but can cause stack overflows or be less efficient than iteration for large inputs. Tail recursion or iteration is safer for deep or large problems.

**Example:**
- Factorial: `fact(n) = n * fact(n-1)`.

**Interview Takeaway:** Use recursion for naturally recursive problems, but know its limits.

### Q4. Explain quick sort vs merge sort

**Answer:** Quick sort is usually faster and in-place; merge sort is stable and predictable but uses more memory.

**Explanation:** Quick sort has O(n log n) average time but O(n²) worst case; merge sort is always O(n log n) but needs extra space. Merge sort is preferred for linked lists or when stability is required.

**Example:**
- Quick sort: partition and recurse.
- Merge sort: divide, sort, and merge.

**Interview Takeaway:** Know when to prefer stability or in-place sorting.

### Q5. What is dynamic programming approach?

**Answer:** Dynamic programming solves problems by breaking them into overlapping subproblems and storing results.

**Explanation:** DP is used when subproblems repeat, allowing memoization or tabulation to avoid redundant work. It is powerful for optimization problems like knapsack or Fibonacci.

**Example:**
- Fibonacci with memoization: `dp[n] = dp[n-1] + dp[n-2]`.

**Interview Takeaway:** Identify overlapping subproblems and optimal substructure for DP.


## 5. Database Design – normalization, ER diagrams, relationships, constraints, indexes, query optimization

1. Explain database normalization (1NF to 3NF)
2. What are ACID properties?
3. Explain primary key vs foreign key
4. How do database indexes improve performance?
5. What is query optimization?

---

### Q1. Explain database normalization (1NF to 3NF)

**Answer:** Normalization organizes data to reduce redundancy and improve integrity, progressing through 1NF, 2NF, and 3NF.

**Explanation:** 1NF removes repeating groups, 2NF removes partial dependencies, and 3NF removes transitive dependencies. This minimizes update anomalies but can increase join complexity.

**Example:**
- 1NF: Each cell has a single value.
- 2NF: All non-key attributes depend on the whole key.
- 3NF: No transitive dependencies.

**Interview Takeaway:** Normalize for integrity, but denormalize for performance when needed.

### Q2. What are ACID properties?

**Answer:** ACID stands for Atomicity, Consistency, Isolation, and Durability—core guarantees for database transactions.

**Explanation:** Atomicity ensures all-or-nothing execution, consistency maintains valid data, isolation prevents concurrent conflicts, and durability guarantees persistence after commit.

**Example:**
- Bank transfer: both debit and credit succeed or fail together.

**Interview Takeaway:** ACID is essential for correctness in transactional systems.

### Q3. Explain primary key vs foreign key

**Answer:** A primary key uniquely identifies a row; a foreign key links to a primary key in another table.

**Explanation:** Primary keys enforce uniqueness, while foreign keys enforce referential integrity between tables. Both are critical for relational modeling.

**Example:**
- `user_id` as primary key in Users; `user_id` as foreign key in Orders.

**Interview Takeaway:** Use keys to maintain data integrity and relationships.

### Q4. How do database indexes improve performance?

**Answer:** Indexes speed up data retrieval by allowing the database to find rows without scanning the entire table.

**Explanation:** Indexes are data structures (like B-trees) that map keys to row locations. They improve SELECT speed but slow down writes and use extra space.

**Example:**
- Index on `email` column for fast user lookup.

**Interview Takeaway:** Index columns used in WHERE, JOIN, and ORDER BY clauses.

### Q5. What is query optimization?

**Answer:** Query optimization is the process of improving query performance by rewriting queries or tuning the database.

**Explanation:** The optimizer chooses the best execution plan based on indexes, statistics, and query structure. Good schema design and proper indexing are key.

**Example:**
- Using EXPLAIN to analyze and improve a slow query.

**Interview Takeaway:** Always check query plans and avoid unnecessary full table scans.


## 6. SQL – SELECT, JOINs, aggregation, subqueries, window functions, transactions

1. Explain INNER JOIN vs LEFT JOIN vs OUTER JOIN
2. What are aggregate functions and GROUP BY?
3. Explain subqueries and when to use them
4. What are window functions?
5. How do transactions work with rollback/commit?

---

### Q1. Explain INNER JOIN vs LEFT JOIN vs OUTER JOIN

**Answer:** INNER JOIN returns only matching rows; LEFT JOIN returns all left rows plus matches; OUTER JOIN returns all rows from both tables.

**Explanation:** INNER JOIN is used when you want only rows with matches in both tables. LEFT JOIN includes all rows from the left table, filling with NULLs if no match. FULL OUTER JOIN includes all rows from both tables, with NULLs where no match exists.

**Example:**
```sql
SELECT * FROM A INNER JOIN B ON A.id = B.id;
```

**Interview Takeaway:** Choose join type based on which data you must always include in results.

### Q2. What are aggregate functions and GROUP BY?

**Answer:** Aggregate functions summarize data (e.g., COUNT, SUM); GROUP BY groups rows for aggregation.

**Explanation:** Aggregates operate on groups of rows, not individual rows. GROUP BY defines how rows are grouped before aggregation. HAVING filters groups after aggregation.

**Example:**
```sql
SELECT department, COUNT(*) FROM employees GROUP BY department;
```

**Interview Takeaway:** Use GROUP BY to aggregate data by categories or keys.

### Q3. Explain subqueries and when to use them

**Answer:** Subqueries are queries nested inside another query; use them for filtering, derived columns, or complex conditions.

**Explanation:** Subqueries can be in SELECT, FROM, or WHERE clauses. Use them when a value or set is easier to compute in a separate step. Correlated subqueries reference outer queries and can be slow.

**Example:**
```sql
SELECT name FROM users WHERE id IN (SELECT user_id FROM orders);
```

**Interview Takeaway:** Use subqueries for clarity, but prefer joins for performance when possible.

### Q4. What are window functions?

**Answer:** Window functions perform calculations across rows related to the current row, without collapsing results.

**Explanation:** They use OVER() to define a window of rows for each calculation. Useful for running totals, rankings, and moving averages.

**Example:**
```sql
SELECT salary, RANK() OVER (ORDER BY salary DESC) FROM employees;
```

**Interview Takeaway:** Use window functions for advanced analytics without losing row detail.

### Q5. How do transactions work with rollback/commit?

**Answer:** Transactions group multiple operations into a single unit; COMMIT saves changes, ROLLBACK undoes them.

**Explanation:** Transactions ensure atomicity—either all changes succeed or none do. Use BEGIN/COMMIT/ROLLBACK to control transaction boundaries. Rollback is critical for error handling.

**Example:**
```sql
BEGIN; UPDATE accounts SET balance = balance - 100 WHERE id=1; COMMIT;
```

**Interview Takeaway:** Always use transactions for multi-step changes to maintain data integrity.


## 7. NoSQL – document databases, key-value stores, eventual consistency, CAP theorem, MongoDB basics

1. Explain SQL vs NoSQL tradeoffs
2. What is eventual consistency?
3. Explain CAP theorem
4. How do you design schema in MongoDB?
5. What are indexes in NoSQL databases?

---

### Q1. Explain SQL vs NoSQL tradeoffs

**Answer:** SQL offers strong consistency and complex queries; NoSQL offers scalability and flexible schemas.

**Explanation:** SQL is best for relational data and ACID guarantees. NoSQL is better for large-scale, unstructured, or rapidly evolving data. NoSQL sacrifices some consistency for partition tolerance and availability.

**Example:**
- SQL: banking systems.
- NoSQL: social media feeds.

**Interview Takeaway:** Choose based on data structure, scale, and consistency needs.

### Q2. What is eventual consistency?

**Answer:** Eventual consistency means all replicas will converge to the same value, but not instantly after a write.

**Explanation:** It's a tradeoff for higher availability and partition tolerance in distributed systems. Reads may return stale data temporarily, but the system guarantees convergence.

**Example:**
- DynamoDB, Cassandra use eventual consistency.

**Interview Takeaway:** Know when temporary staleness is acceptable for your use case.

### Q3. Explain CAP theorem

**Answer:** CAP theorem states a distributed system can only guarantee two of Consistency, Availability, and Partition Tolerance at once.

**Explanation:** During a network partition, you must choose between serving stale data (availability) or rejecting requests (consistency). Most NoSQL systems choose AP or CP.

**Example:**
- MongoDB (CP), DynamoDB (AP).

**Interview Takeaway:** Be able to explain which guarantees your chosen database provides.

### Q4. How do you design schema in MongoDB?

**Answer:** Design MongoDB schemas around access patterns, embedding related data and referencing when necessary.

**Explanation:** Embed data for one-to-few relationships and reference for one-to-many or shared data. Avoid deep nesting and design for efficient queries.

**Example:**
- Embed address in user document; reference user in orders.

**Interview Takeaway:** Schema design should optimize for common queries, not just data structure.

### Q5. What are indexes in NoSQL databases?

**Answer:** Indexes in NoSQL databases speed up queries by allowing fast lookups on fields.

**Explanation:** Like SQL, indexes in NoSQL (e.g., MongoDB) use B-trees or similar structures. They improve read performance but add write overhead and use extra storage.

**Example:**
- MongoDB index on `email` field.

**Interview Takeaway:** Always index fields used in queries and filters for performance.


## 8. REST API Design – HTTP methods, status codes, versioning, pagination, filtering, error handling

1. Explain REST principles and constraints
2. What HTTP status codes indicate what?
3. How do you version APIs?
4. What are best practices for pagination?
5. How do you handle API errors?

---

### Q1. Explain REST principles and constraints

**Answer:** REST is resource-oriented, stateless, and uses standard HTTP methods and status codes.

**Explanation:** RESTful APIs treat everything as a resource, use nouns for endpoints, and rely on HTTP verbs (GET, POST, PUT, DELETE). Statelessness means each request contains all necessary context.

**Example:**
- `GET /users/1` retrieves user 1.

**Interview Takeaway:** Stick to REST constraints for predictability and interoperability.

### Q2. What HTTP status codes indicate what?

**Answer:** 2xx = success, 4xx = client error, 5xx = server error.

**Explanation:** Use 200 for OK, 201 for created, 400 for bad request, 401 for unauthorized, 404 for not found, 500 for server error. Use specific codes to help clients handle errors correctly.

**Example:**
- 200 OK, 404 Not Found, 500 Internal Server Error.

**Interview Takeaway:** Return precise status codes for clear client-server communication.

### Q3. How do you version APIs?

**Answer:** Version APIs using the URL (e.g., `/v1/`) or headers to avoid breaking existing clients.

**Explanation:** URL versioning is simple and visible; header versioning keeps URLs clean but is harder to debug. Versioning is needed when making breaking changes.

**Example:**
- `/api/v1/users`

**Interview Takeaway:** Plan for versioning from the start to support future changes.

### Q4. What are best practices for pagination?

**Answer:** Use limit/offset or cursor-based pagination, and always return metadata (total, next page).

**Explanation:** Offset is simple but can skip items if data changes; cursor is more robust for large or changing datasets. Always include pagination info in responses.

**Example:**
- `GET /users?limit=10&offset=20`

**Interview Takeaway:** Use cursor pagination for large or real-time datasets.

### Q5. How do you handle API errors?

**Answer:** Return structured error responses with status code, error code, message, and (optionally) a correlation ID.

**Explanation:** Avoid vague or generic error messages. Provide enough detail for clients to debug, but don't leak sensitive info. Use consistent error formats.

**Example:**
```json
{"error": "InvalidInput", "message": "Email is required."}
```

**Interview Takeaway:** Consistent, informative errors improve client experience and debuggability.


## 9. Authentication & Authorization – JWT, OAuth, session-based auth, password hashing, token refresh

1. Explain JWT structure and how it works
2. What is the difference between authentication and authorization?
3. How do you securely store passwords?
4. Explain OAuth 2.0 flow
5. When should tokens refresh?

---

### Q1. Explain JWT structure and how it works

**Answer:** A JWT consists of a header, payload, and signature, and is used for stateless authentication.

**Explanation:** The header specifies the algorithm, the payload contains claims, and the signature verifies integrity. JWTs are base64-encoded and can be verified without server state, but should not store sensitive data.

**Example:**
- `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Interview Takeaway:** Know JWT's structure and security limitations.

### Q2. What is the difference between authentication and authorization?

**Answer:** Authentication verifies identity; authorization determines access rights.

**Explanation:** Authentication answers "Who are you?" Authorization answers "What can you do?" Keep them separate for clarity and security.

**Example:**
- Login (authentication), access control (authorization).

**Interview Takeaway:** Never confuse identity with permissions in your design.

### Q3. How do you securely store passwords?

**Answer:** Store only salted, hashed passwords using a slow hash function like bcrypt, scrypt, or Argon2.

**Explanation:** Never store plain text or unsalted hashes. Use a unique salt per password and a hash function designed to resist brute-force attacks.

**Example:**
- `bcrypt(password + salt)`

**Interview Takeaway:** Password storage is a top security risk—always use best practices.

### Q4. Explain OAuth 2.0 flow

**Answer:** OAuth 2.0 allows third-party apps to access user data without sharing credentials, using access and refresh tokens.

**Explanation:** The user authorizes the app, which receives an authorization code, exchanges it for an access token, and uses the token for API calls. Refresh tokens allow continued access without re-authentication.

**Example:**
- Google login with "Sign in with Google".

**Interview Takeaway:** Understand the difference between authorization code, access token, and refresh token.

### Q5. When should tokens refresh?

**Answer:** Refresh tokens when the access token expires, typically after a short period (minutes to hours).

**Explanation:** Short-lived access tokens limit exposure if stolen. Refresh tokens are longer-lived and should be securely stored and rotated if compromised.

**Example:**
- Access token: 15 min; refresh token: 7 days.

**Interview Takeaway:** Use short-lived access tokens and secure refresh tokens for best security.


## 10. Security – SQL injection, XSS, CSRF, encryption, SSL/TLS, secrets management

1. How do you prevent SQL injection?
2. What are common security vulnerabilities?
3. Explain symmetric vs asymmetric encryption
4. How do you manage secrets in production?
5. What is SSL/TLS handshake?

---

### Q1. How do you prevent SQL injection?

**Answer:** Use parameterized queries or prepared statements instead of string concatenation.

**Explanation:** Parameterized queries separate code from data, preventing attackers from injecting malicious SQL. Input validation helps, but is not sufficient alone.

**Example:**
- `cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))`

**Interview Takeaway:** Always use parameterized queries for user input.

### Q2. What are common security vulnerabilities?

**Answer:** Common vulnerabilities include SQL injection, XSS, CSRF, broken authentication, and insecure storage.

**Explanation:** These flaws allow attackers to steal data, impersonate users, or disrupt service. Prevent them with input validation, output encoding, secure authentication, and least privilege.

**Example:**
- XSS: `<script>alert('x')</script>` in user input.

**Interview Takeaway:** Know the OWASP Top 10 and how to mitigate each risk.

### Q3. Explain symmetric vs asymmetric encryption

**Answer:** Symmetric encryption uses one key for encryption/decryption; asymmetric uses a public/private key pair.

**Explanation:** Symmetric is fast and used for bulk data; asymmetric is slower but enables secure key exchange and digital signatures.

**Example:**
- AES (symmetric), RSA (asymmetric).

**Interview Takeaway:** Use asymmetric for key exchange, symmetric for data at rest.

### Q4. How do you manage secrets in production?

**Answer:** Store secrets in a secure vault or managed secrets service, never in code or config files.

**Explanation:** Use tools like AWS Secrets Manager or HashiCorp Vault. Rotate secrets regularly and restrict access by least privilege.

**Example:**
- Environment variables loaded from a secrets manager.

**Interview Takeaway:** Never hardcode secrets; automate secret management.

### Q5. What is SSL/TLS handshake?

**Answer:** The SSL/TLS handshake establishes a secure, encrypted connection between client and server.

**Explanation:** It negotiates encryption algorithms, exchanges keys, and verifies certificates before data transfer. This ensures confidentiality and integrity in transit.

**Example:**
- HTTPS connection setup.

**Interview Takeaway:** Understand the basics of how encrypted connections are established.


## 11. Caching – in-memory caching, Redis, cache invalidation, cache patterns, TTL

1. When should you use caching?
2. Explain cache invalidation strategies
3. What are cache patterns (LRU, LFU)?
4. How does Redis work?
5. When to use distributed caching?

---

### Q1. When should you use caching?

**Answer:** Use caching when data is expensive to compute or fetch, and can tolerate some staleness.

**Explanation:** Caching improves performance and reduces load, but risks serving outdated data. Use it for frequently accessed, rarely changing data.

**Example:**
- Caching user profiles or product lists.

**Interview Takeaway:** Cache only when it brings clear performance benefits and correctness is not compromised.

### Q2. Explain cache invalidation strategies

**Answer:** Strategies include TTL (time-to-live), manual eviction, write-through, and cache-aside.

**Explanation:** TTL expires data after a set time. Write-through updates cache and DB together. Cache-aside loads data on miss. Invalidation is hard—ensure consistency with the source.

**Example:**
- Redis key with 60s TTL.

**Interview Takeaway:** Invalidation is the hardest part—plan for it.

### Q3. What are cache patterns (LRU, LFU)?

**Answer:** LRU evicts least recently used items; LFU evicts least frequently used items.

**Explanation:** LRU is good for workloads with temporal locality; LFU for workloads with hot items accessed repeatedly. Choose based on access patterns.

**Example:**
- Redis supports LRU eviction.

**Interview Takeaway:** Match eviction policy to your application's access pattern.

### Q4. How does Redis work?

**Answer:** Redis is an in-memory key-value store supporting various data structures and persistence options.

**Explanation:** It stores data in RAM for fast access, supports strings, hashes, lists, sets, and can persist to disk. Used for caching, sessions, and queues.

**Example:**
- `SET user:1:name "Alice"`

**Interview Takeaway:** Redis is more than a cache—know its data structures and use cases.

### Q5. When to use distributed caching?

**Answer:** Use distributed caching when a single cache can't handle load or must be shared across servers.

**Explanation:** Distributed caches (like Redis Cluster) scale horizontally and provide high availability, but add complexity and consistency challenges.

**Example:**
- Multi-node Redis for a web app behind a load balancer.

**Interview Takeaway:** Use distributed caching for scale, but beware of consistency and invalidation issues.


## 12. Concurrency & Threading – threads, locks, deadlocks, race conditions, thread safety, async/await

1. Explain threads and processes
2. What is a race condition and how to prevent it?
3. What are deadlocks and how to avoid them?
4. Explain mutex and semaphores
5. What is thread pooling?

---

### Q1. Explain threads and processes

**Answer:** A process is an independent program with its own memory; a thread is a lightweight unit of execution within a process.

**Explanation:** Threads share memory and resources within a process, enabling parallelism but requiring synchronization. Processes are isolated, providing safety but with higher overhead.

**Example:**
- Python threading.Thread vs multiprocessing.Process.

**Interview Takeaway:** Know when to use threads (shared state) vs processes (isolation).

### Q2. What is a race condition and how to prevent it?

**Answer:** A race condition occurs when multiple threads access shared data concurrently, leading to unpredictable results.

**Explanation:** Prevent race conditions with locks, atomic operations, or by avoiding shared mutable state. Always protect critical sections.

**Example:**
- Using a mutex to guard a shared counter.

**Interview Takeaway:** Always synchronize access to shared data.

### Q3. What are deadlocks and how to avoid them?

**Answer:** Deadlocks happen when threads wait indefinitely for resources held by each other.

**Explanation:** Avoid deadlocks by acquiring locks in a consistent order, using timeouts, or minimizing lock scope. Detect and recover if possible.

**Example:**
- Two threads each holding one lock and waiting for the other.

**Interview Takeaway:** Lock ordering and timeouts are key to avoiding deadlocks.

### Q4. Explain mutex and semaphores

**Answer:** A mutex allows only one thread to access a resource; a semaphore allows a fixed number of threads.

**Explanation:** Mutexes are for exclusive access; semaphores are for limiting concurrency. Both are used to coordinate access to shared resources.

**Example:**
- Python threading.Lock (mutex), threading.Semaphore(3).

**Interview Takeaway:** Choose the right synchronization primitive for your concurrency needs.

### Q5. What is thread pooling?

**Answer:** Thread pooling reuses a fixed set of threads to execute many tasks, reducing overhead.

**Explanation:** Pools avoid the cost of creating/destroying threads for each task, improving performance and predictability. Common in web servers and async frameworks.

**Example:**
- Java ExecutorService, Python ThreadPoolExecutor.

**Interview Takeaway:** Use thread pools for scalable, efficient task execution.


## 13. Microservices – service decomposition, communication, API gateway, service discovery, load balancing

1. What is microservices architecture?
2. How do services communicate (REST vs async)?
3. What is an API gateway?
4. Explain service discovery
5. How does load balancing work?

---

### Q1. What is microservices architecture?

**Answer:** Microservices architecture breaks an application into small, independent services that communicate over a network.

**Explanation:** Each service is responsible for a specific business capability, can be deployed independently, and often has its own database. This enables scalability and team autonomy but increases operational complexity.

**Example:**
- User service, order service, payment service in an e-commerce app.

**Interview Takeaway:** Microservices are about independent deployment and scaling, not just splitting code.

### Q2. How do services communicate (REST vs async)?

**Answer:** Services communicate synchronously via REST/gRPC or asynchronously via message queues/events.

**Explanation:** REST is simple and widely supported, but can create tight coupling and latency. Async messaging (e.g., RabbitMQ, Kafka) decouples services and improves resilience.

**Example:**
- REST for user lookup; Kafka for order events.

**Interview Takeaway:** Choose communication style based on latency, coupling, and reliability needs.

### Q3. What is an API gateway?

**Answer:** An API gateway is a single entry point that routes requests to backend services and handles cross-cutting concerns.

**Explanation:** It manages authentication, rate limiting, logging, and request transformation, simplifying client interactions and centralizing policy enforcement.

**Example:**
- Kong, AWS API Gateway.

**Interview Takeaway:** API gateways simplify clients and centralize security and monitoring.

### Q4. Explain service discovery

**Answer:** Service discovery enables services to find each other dynamically without hardcoded addresses.

**Explanation:** It uses registries (like Consul, Eureka) to track available service instances, supporting scaling and failover.

**Example:**
- Service registers with Consul; others query Consul to find it.

**Interview Takeaway:** Service discovery is essential for dynamic, scalable systems.

### Q5. How does load balancing work?

**Answer:** Load balancing distributes incoming requests across multiple servers to optimize resource use and availability.

**Explanation:** It can be done at the network, application, or DNS level, using algorithms like round-robin or least connections. Load balancers detect unhealthy instances and reroute traffic.

**Example:**
- NGINX, AWS ELB.

**Interview Takeaway:** Load balancing is key for high availability and scalability.


## 14. Message Queues – event streaming, pub-sub, message ordering, RabbitMQ, Kafka, dead letter queues

1. Explain pub-sub messaging pattern
2. When do you use message queues?
3. What is event sourcing?
4. Explain message ordering guarantees
5. What are dead letter queues?

---

### Q1. Explain pub-sub messaging pattern

**Answer:** In pub-sub, publishers send messages to topics, and subscribers receive messages from those topics independently.

**Explanation:** This decouples producers from consumers, allowing multiple consumers to process the same message. It's useful for broadcasting events to many listeners.

**Example:**
- Kafka topics, Redis pub/sub.

**Interview Takeaway:** Pub-sub is for decoupling and broadcasting, not point-to-point delivery.

### Q2. When do you use message queues?

**Answer:** Use message queues to decouple producers and consumers, buffer workloads, and enable async processing.

**Explanation:** Queues absorb bursts, allow retrying failed tasks, and smooth out load. They're essential for reliability and scalability in distributed systems.

**Example:**
- RabbitMQ for background job processing.

**Interview Takeaway:** Message queues improve resilience and scalability.

### Q3. What is event sourcing?

**Answer:** Event sourcing stores state changes as a sequence of events, not just the latest state.

**Explanation:** This provides a complete audit trail and enables rebuilding state by replaying events. It adds complexity to reads and requires careful event design.

**Example:**
- Banking transactions as events.

**Interview Takeaway:** Event sourcing is for auditability and replay, not just persistence.

### Q4. Explain message ordering guarantees

**Answer:** Message ordering guarantees define whether messages are delivered in the order sent.

**Explanation:** Some systems guarantee ordering within a partition or queue, but not globally. Ordering is important for correctness in some workflows.

**Example:**
- Kafka guarantees order within a partition.

**Interview Takeaway:** Know your system's ordering guarantees and design accordingly.

### Q5. What are dead letter queues?

**Answer:** Dead letter queues (DLQs) store messages that can't be processed after several attempts.

**Explanation:** DLQs prevent message loss and help diagnose processing issues. They are essential for robust, debuggable systems.

**Example:**
- AWS SQS DLQ for failed jobs.

**Interview Takeaway:** Always configure DLQs to handle poison messages safely.


## 15. System Design – scaling, availability, consistency, monitoring, capacity planning

1. Explain horizontal vs vertical scaling
2. What are strategies for high availability?
3. How do you design for scalability?
4. What is consistency in distributed systems?
5. How do you monitor production systems?

---

### Q1. Explain horizontal vs vertical scaling

**Answer:** Horizontal scaling adds more machines; vertical scaling adds more resources (CPU/RAM) to a single machine.

**Explanation:** Horizontal scaling improves fault tolerance and is more flexible long-term. Vertical scaling is simpler but limited by hardware.

**Example:**
- Adding servers to a web farm (horizontal); upgrading server RAM (vertical).

**Interview Takeaway:** Horizontal scaling is preferred for large, resilient systems.

### Q2. What are strategies for high availability?

**Answer:** Use redundancy, failover, health checks, and multi-region deployments to ensure uptime.

**Explanation:** Remove single points of failure, automate recovery, and monitor system health. High availability is about minimizing downtime.

**Example:**
- Load balancers with multiple backend servers.

**Interview Takeaway:** Design for failure, not just normal operation.

### Q3. How do you design for scalability?

**Answer:** Design stateless services, partition data, use caching, and offload slow work to async jobs.

**Explanation:** Scalability is about handling growth in users or data. Statelessness and partitioning (sharding) make it easier to add capacity.

**Example:**
- Sharding a database by user ID.

**Interview Takeaway:** Scalability is mostly a data and state problem.

### Q4. What is consistency in distributed systems?

**Answer:** Consistency means all nodes see the same data at the same time, or within a defined window.

**Explanation:** Strong consistency guarantees up-to-date reads; eventual consistency allows temporary divergence. Choose based on correctness vs latency/availability needs.

**Example:**
- Bank balances require strong consistency; social feeds can use eventual consistency.

**Interview Takeaway:** Know when strong or eventual consistency is required.

### Q5. How do you monitor production systems?

**Answer:** Use metrics, logs, traces, and alerts to detect and diagnose issues in real time.

**Explanation:** Monitoring tools track system health, performance, and errors. Good monitoring enables fast detection and resolution of problems.

**Example:**
- Prometheus for metrics, ELK stack for logs.

**Interview Takeaway:** Monitoring is essential for reliability and rapid incident response.


## 16. Deployment & DevOps – CI/CD, containerization, Docker, Kubernetes, logging, monitoring

1. What is CI/CD pipeline?
2. How do Docker containers work?
3. What is Kubernetes and why use it?
4. Explain blue-green deployment
5. What logging best practices should you follow?

---

### Q1. What is CI/CD pipeline?

**Answer:** CI/CD automates building, testing, and deploying code changes to production.

**Explanation:** Continuous Integration (CI) runs tests on every change; Continuous Deployment (CD) automates releases. This reduces manual errors and speeds up delivery.

**Example:**
- GitHub Actions running tests and deploying to AWS.

**Interview Takeaway:** CI/CD is about automation, speed, and reliability.

### Q2. How do Docker containers work?

**Answer:** Docker containers package applications and dependencies into isolated, portable units.

**Explanation:** Containers share the host OS kernel but have separate filesystems and resources. This ensures consistency across environments.

**Example:**
- `docker run nginx`

**Interview Takeaway:** Containers solve "works on my machine" problems.

### Q3. What is Kubernetes and why use it?

**Answer:** Kubernetes orchestrates container deployment, scaling, and management across clusters.

**Explanation:** It automates scheduling, health checks, scaling, and rollouts. Kubernetes is powerful for large, dynamic systems but adds operational complexity.

**Example:**
- Deploying a web app with `kubectl apply`.

**Interview Takeaway:** Kubernetes is for managing containers at scale.

### Q4. Explain blue-green deployment

**Answer:** Blue-green deployment runs two environments (blue and green) and switches traffic to the new version when ready.

**Explanation:** This enables zero-downtime releases and fast rollback if issues occur. Only one environment serves users at a time.

**Example:**
- Deploy new code to green, switch load balancer from blue to green.

**Interview Takeaway:** Blue-green reduces deployment risk and downtime.

### Q5. What logging best practices should you follow?

**Answer:** Log structured data, include context (IDs, timestamps), and avoid sensitive information.

**Explanation:** Use consistent formats (JSON), log at appropriate levels, and centralize logs for analysis. Good logs aid debugging and monitoring.

**Example:**
- `{"userId": 1, "action": "login", "status": "success"}`

**Interview Takeaway:** Good logging is essential for troubleshooting and observability.


## 17. Design Patterns – Singleton, Factory, Observer, Strategy, Decorator, Repository Pattern

1. When would you use Singleton pattern?
2. Explain Factory pattern benefits
3. What is the Observer pattern used for?
4. When should you use Strategy pattern?
5. What is Repository pattern?

---

### Q1. When would you use Singleton pattern?

**Answer:** Use Singleton when only one instance of a class should exist, such as for configuration or logging.

**Explanation:** Singleton restricts instantiation and provides a global access point. Overuse can lead to hidden dependencies and testing difficulties.

**Example:**
- Logger or database connection pool.

**Interview Takeaway:** Use Singleton sparingly to avoid global state issues.

### Q2. Explain Factory pattern benefits

**Answer:** Factory pattern centralizes object creation, making code more flexible and decoupled.

**Explanation:** It hides instantiation logic, supports polymorphism, and makes it easy to add new types without changing client code.

**Example:**
- ShapeFactory creates Circle or Square based on input.

**Interview Takeaway:** Factory simplifies object creation and supports open/closed principle.

### Q3. What is the Observer pattern used for?

**Answer:** Observer lets multiple objects react to changes in another object, enabling event-driven systems.

**Explanation:** Observers subscribe to subjects and are notified of state changes. Useful for GUIs, event buses, and pub-sub systems.

**Example:**
- UI components updating on data change.

**Interview Takeaway:** Observer decouples event producers from consumers.

### Q4. When should you use Strategy pattern?

**Answer:** Use Strategy to swap algorithms or behaviors at runtime without changing client code.

**Explanation:** It encapsulates algorithms behind a common interface, making code more flexible and testable.

**Example:**
- Payment processing with different strategies for credit card, PayPal, etc.

**Interview Takeaway:** Strategy avoids large if-else chains and supports open/closed principle.

### Q5. What is Repository pattern?

**Answer:** Repository abstracts data access, providing a clean interface between domain and persistence layers.

**Explanation:** It hides data storage details, making code easier to test and refactor. Supports switching databases with minimal changes.

**Example:**
- UserRepository with methods like `findById`, `save`.

**Interview Takeaway:** Repository decouples business logic from data access.


## 18. Testing – unit tests, integration tests, mocking, test coverage, TDD

1. What should unit tests cover?
2. Explain mocking and why it's useful
3. What is integration testing?
4. How do you measure test coverage?
5. What is test-driven development?

---

### Q1. What should unit tests cover?

**Answer:** Unit tests should cover individual functions or methods, including edge cases and error handling.

**Explanation:** They verify correctness of small, isolated units of code. Good unit tests are fast, deterministic, and independent of external systems.

**Example:**
- Testing a function that adds two numbers.

**Interview Takeaway:** Focus unit tests on logic, not integration or side effects.

### Q2. Explain mocking and why it's useful

**Answer:** Mocking replaces real dependencies with controlled fakes in tests.

**Explanation:** It isolates the code under test, making tests faster and more reliable. Useful for simulating APIs, databases, or time.

**Example:**
- Mocking an HTTP client in a service test.

**Interview Takeaway:** Mocking keeps tests focused and deterministic.

### Q3. What is integration testing?

**Answer:** Integration testing verifies that multiple components work together as expected.

**Explanation:** It tests interactions between modules, such as API and database, catching issues missed by unit tests. Slower and more complex than unit tests.

**Example:**
- Testing a REST endpoint with a real database.

**Interview Takeaway:** Integration tests catch wiring and configuration errors.

### Q4. How do you measure test coverage?

**Answer:** Test coverage measures the percentage of code executed by tests.

**Explanation:** Tools instrument code to track which lines, branches, or paths are run during tests. High coverage is good, but quality matters more than quantity.

**Example:**
- Using `coverage.py` or Istanbul.

**Interview Takeaway:** Coverage is a signal, not a goal—focus on meaningful tests.

### Q5. What is test-driven development?

**Answer:** TDD is writing tests before code, then implementing the simplest code to pass the tests.

**Explanation:** TDD encourages clear requirements, fast feedback, and safer refactoring. Write a failing test, make it pass, then refactor.

**Example:**
- Red-Green-Refactor cycle.

**Interview Takeaway:** TDD improves code quality and confidence in changes.


## 19. Code Quality & Performance – code reviews, documentation, profiling, bottleneck identification

1. What makes code maintainable?
2. How do you profile application performance?
3. What are code review best practices?
4. How do you identify performance bottlenecks?
5. What is technical debt?

---

### Q1. What makes code maintainable?

**Answer:** Maintainable code is readable, well-structured, and easy to modify or extend.

**Explanation:** It uses clear naming, small functions, good documentation, and tests. Maintainable code reduces bugs and speeds up future changes.

**Example:**
- Descriptive variable names, modular design.

**Interview Takeaway:** Write code for the next developer, not just yourself.

### Q2. How do you profile application performance?

**Answer:** Use profiling tools to measure where time and resources are spent in your application.

**Explanation:** Profilers identify slow functions, memory leaks, or bottlenecks. Always measure before optimizing.

**Example:**
- Python cProfile, Node.js --inspect.

**Interview Takeaway:** Profile before you optimize—guessing is wasteful.

### Q3. What are code review best practices?

**Answer:** Review for correctness, clarity, test coverage, and adherence to standards.

**Explanation:** Give constructive feedback, ask questions, and focus on the code, not the person. Use checklists to ensure consistency.

**Example:**
- Reviewing for security issues and edge cases.

**Interview Takeaway:** Code reviews are for quality and learning, not just gatekeeping.

### Q4. How do you identify performance bottlenecks?

**Answer:** Use monitoring, profiling, and tracing to find the slowest parts of your system.

**Explanation:** Start with user-facing symptoms, then drill down to code, database, or infrastructure. Fix the biggest bottleneck first.

**Example:**
- Slow API traced to a database query.

**Interview Takeaway:** Always measure and prioritize before optimizing.

### Q5. What is technical debt?

**Answer:** Technical debt is the cost of shortcuts or suboptimal solutions that require future rework.

**Explanation:** Some debt is intentional for speed, but unmanaged debt slows development and increases bugs. Track and pay down debt regularly.

**Example:**
- Skipping tests to meet a deadline.

**Interview Takeaway:** Acknowledge and manage technical debt to keep projects healthy.


## 20. Cloud Services – AWS, GCP, Azure basics, services, scaling, deployment

1. What are main AWS services?
2. Explain EC2 vs Lambda vs RDS
3. How do you scale applications in cloud?
4. What is serverless architecture?
5. How do you handle data storage in cloud?

---

### Q1. What are main AWS services?

**Answer:** Key AWS services include EC2 (compute), S3 (storage), RDS (databases), Lambda (serverless), and IAM (security).

**Explanation:** EC2 provides virtual servers, S3 stores objects, RDS manages relational databases, Lambda runs code without servers, and IAM controls access. These are the building blocks for most AWS architectures.

**Example:**
- Hosting a web app on EC2, storing files in S3.

**Interview Takeaway:** Know the core AWS services and their primary use cases.

### Q2. Explain EC2 vs Lambda vs RDS

**Answer:** EC2 is for full server control, Lambda is for event-driven serverless compute, RDS is for managed relational databases.

**Explanation:** EC2 gives flexibility but requires management. Lambda is scalable and cost-effective for short tasks. RDS handles backups, scaling, and patching for databases.

**Example:**
- EC2 for custom apps, Lambda for image processing, RDS for transactional data.

**Interview Takeaway:** Choose based on control, scalability, and operational needs.

### Q3. How do you scale applications in cloud?

**Answer:** Scale by adding instances (horizontal), increasing resources (vertical), and using managed services.

**Explanation:** Use auto-scaling groups, load balancers, and managed databases. Cloud platforms make scaling easier but require good architecture.

**Example:**
- Auto-scaling EC2 instances behind a load balancer.

**Interview Takeaway:** Design for horizontal scaling and automation.

### Q4. What is serverless architecture?

**Answer:** Serverless runs code in response to events without managing servers, using services like AWS Lambda.

**Explanation:** It abstracts infrastructure, scales automatically, and charges per use. Good for bursty or event-driven workloads, but has cold start and vendor lock-in tradeoffs.

**Example:**
- Lambda function triggered by S3 upload.

**Interview Takeaway:** Serverless is about operational simplicity and scaling, not zero servers.

### Q5. How do you handle data storage in cloud?

**Answer:** Use object storage (S3), managed databases (RDS, DynamoDB), and distributed caches (ElastiCache) based on data type and access pattern.

**Explanation:** Choose storage based on consistency, durability, and performance needs. Cloud services offer redundancy and scaling out of the box.

**Example:**
- S3 for files, RDS for transactions, DynamoDB for NoSQL.

**Interview Takeaway:** Match storage type to workload and access patterns.
