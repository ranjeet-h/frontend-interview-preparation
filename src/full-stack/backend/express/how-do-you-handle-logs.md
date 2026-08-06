# How do you handle logs

## Detailed explanation

How do you handle logs is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you handle logs by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle logs affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle logging in Express?
- **The Engine Mechanism (Why it behaves this way):** Use a structured logging library like Winston or Pino instead of `console.log`. These libraries provide: (1) **Log levels** — error, warn, info, debug, trace — for filtering. (2) **Structured output** — JSON format with timestamps, request IDs, user IDs. (3) **Transports** — write to files, stdout, or external services (Datadog, CloudWatch). (4) **Request logging** — Morgan middleware logs each HTTP request: `app.use(morgan('combined'))`. For production, use Pino for performance (10x faster than Winston) or Winston for flexibility. Always include a unique request ID for tracing.
- **The Unforgettable Mental Model:** The **Flight Recorder**. Every request is a flight. The logger records takeoff (request received), altitude changes (middleware processing), turbulence (errors), and landing (response sent). If something crashes, you replay the recording to find out why.
- **The Trap:** Using console.log in production. It's unstructured, has no log levels, blocks the event loop for large outputs, and can't be filtered or shipped to monitoring services.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use structured logging with Winston or Pino instead of console.log. Each log entry is JSON with a timestamp, log level, request ID, and context. I use Morgan for HTTP request logging and add custom middleware to attach a unique request ID to every request. In production, logs are shipped to a centralized service like Datadog or CloudWatch for aggregation, alerting, and search. I use different log levels — info for normal operations, warn for concerning patterns, error for failures."

#### What is the difference between Morgan and Winston/Pino?
- **The Engine Mechanism (Why it behaves this way):** Morgan is HTTP request logger — it logs each incoming request with method, URL, status code, response time, and user agent. It's simple and purpose-built for HTTP logging. Winston and Pino are general-purpose application loggers — they log anything: business events, errors, database queries, background jobs. They support log levels, multiple transports, and structured JSON output. In practice, use both: Morgan for HTTP request logs, Winston/Pino for application-level logs.
- **The Unforgettable Mental Model:** **Traffic Camera vs. Security System**. Morgan is the traffic camera at the entrance — it records every vehicle (request) that comes in. Winston/Pino is the full security system — it records everything happening inside the building (application events, errors, business logic).
- **The Trap:** Using only Morgan and missing application-level logs, or using only Winston and missing structured HTTP request logs. They serve different purposes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Morgan logs HTTP requests — method, URL, status, response time. Winston and Pino log application events — errors, business logic, database queries. I use both: Morgan for the HTTP layer and Winston/Pino for everything else. Morgan gives me request-level visibility; Winston/Pino gives me application-level context. Together they provide complete observability."

#### How do you add request IDs for tracing?
- **The Engine Mechanism (Why it behaves this way):** Generate a unique ID at the start of each request and attach it to `req`: `const { v4: uuidv4 } = require('uuid'); app.use((req, res, next) => { req.requestId = uuidv4(); res.setHeader('X-Request-ID', req.requestId); next(); });`. Include this ID in every log entry: `logger.info('Processing request', { requestId: req.requestId, userId: req.user?.id })`. This allows you to trace all log entries for a single request across middleware, routes, and services. The ID is also returned in the response header so the frontend can include it in bug reports.
- **The Unforgettable Mental Model:** The **Package Tracking Number**. Every package (request) gets a tracking number (request ID). Every scan (log entry) along the way references that number. If the package is lost, you look up the tracking number to see its entire journey.
- **The Trap:** Not including the request ID in error logs. When debugging production issues, the request ID is the primary way to correlate all log entries for a single request.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I generate a UUID at the start of each request and attach it to req.requestId. I include it in every log entry and set it as an X-Request-ID response header. This lets me trace all log entries for a single request across the entire middleware chain. When users report bugs, I ask for the request ID from the response header, which lets me find all related logs instantly. It's the single most useful debugging tool in production."

#### What log levels should you use?
- **The Engine Mechanism (Why it behaves this way):** Standard levels: (1) **error** — something failed (database connection lost, unhandled exception). Always monitored and alerted. (2) **warn** — something concerning but not critical (deprecated API usage, slow query, rate limit approaching). (3) **info** — normal operations (user logged in, order placed, request completed). (4) **debug** — detailed diagnostic info (query parameters, middleware execution). Only enabled in development/staging. (5) **trace** — extremely detailed (every function call). Rarely used. In production, set level to `info` or `warn` to reduce log volume.
- **The Unforgettable Mental Model:** The **Emergency Triage**. error = critical (immediate attention), warn = urgent (investigate soon), info = normal (routine checkup), debug = detailed examination (only when needed), trace = microscopic analysis (rarely needed).
- **The Trap:** Logging everything at info level — makes it impossible to filter for important events. Or logging sensitive data (passwords, tokens) at any level.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use five log levels. Error for failures that need immediate attention, warn for concerning patterns, info for normal business events, debug for development diagnostics, and trace for deep debugging. In production, I set the level to info to balance visibility with log volume. I never log sensitive data at any level. I also set up alerts for error-level logs and monitor warn-level trends to catch issues before they become errors."

#### How do you ship logs to a monitoring service?
- **The Engine Mechanism (Why it behaves this way):** Configure logging transports to send logs to external services: Winston: `logger.add(new winston.transports.Http({ url: 'https://logs.service.com/ingest' }))` or use a logging agent (Fluentd, Logstash) that reads log files and ships them. For cloud platforms: AWS CloudWatch (`winston-cloudwatch`), GCP Cloud Logging (`@google-cloud/logging-winston`), Datadog (`winston-datadog-logs`). Structure logs as JSON for easy parsing. Include metadata: service name, environment, version, request ID, user ID. Set up alerts for error rates and log volume anomalies.
- **The Unforgettable Mental Model:** The **Mail Sorting Facility**. Local logs are like mail in the building's mailbox. The shipping service (transport) collects all mail, sorts it by destination (service name, environment), and delivers it to the central post office (monitoring service) where it can be searched and analyzed.
- **The Trap:** Shipping logs synchronously — if the logging service is slow or down, it blocks your application. Use async transports or local buffering with batch shipping.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I configure Winston or Pino to ship logs asynchronously to a centralized service like Datadog or CloudWatch. Logs are structured as JSON with metadata: service name, environment, version, request ID. I use async transports so logging doesn't block the application. I set up alerts for error rate spikes and log volume anomalies. I also keep a local log file as a fallback in case the shipping service is unavailable."

## 8. Active recall test

1. **Why not use console.log for production logging?**
   - **Explanation:** It's unstructured, has no log levels, blocks the event loop for large outputs, and can't be filtered or shipped to monitoring services. Use structured loggers like Winston or Pino.

2. **What is the difference between Morgan and Winston?**
   - **Explanation:** Morgan logs HTTP requests (method, URL, status, response time). Winston is a general-purpose application logger for errors, business events, and debug info. Use both.

3. **Why use request IDs in logs?**
   - **Explanation:** They allow tracing all log entries for a single request across the entire middleware chain. Essential for debugging production issues by correlating related log entries.

4. **What log levels should be used in production?**
   - **Explanation:** Set level to 'info' or 'warn'. Error for failures, warn for concerning patterns, info for normal operations. Debug and trace are for development/staging only.

5. **How should logs be shipped to monitoring services?**
   - **Explanation:** Asynchronously via transports (HTTP, file agents) to services like Datadog or CloudWatch. Logs should be structured JSON with metadata. Never ship synchronously as it blocks the app.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle logs in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle logs in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
