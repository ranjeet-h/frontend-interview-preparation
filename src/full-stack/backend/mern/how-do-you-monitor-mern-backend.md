# How do you monitor MERN backend

## 1. The Real-World Problem — When You Actually Hit This

Your MERN app launched last month. Users loved it. Then one Friday evening, the CEO emails you: "customers are complaining the site is slow." You check the server — CPU looks fine, memory looks fine. The database seems connected. But requests that took 200ms are now taking 8 seconds. You have no idea why. You're flying blind. You add logging, redeploy, wait for the next incident. A week later, it happens again. By the time you figure out it's a missing index on a MongoDB query that's scanning 2 million documents, you've lost hundreds of users and the CEO has lost confidence in the team.

This is what happens without monitoring. You find out about problems from users, not from your systems. You debug in production while users are waiting. You fix the same thing repeatedly because you never saw the pattern. Monitoring isn't a nice-to-have — it's the difference between knowing about a problem before your users do and finding out from angry support tickets.

## 2. The Analogy — Make the Mechanic Obvious

Think of your backend like a commercial airplane. A plane has hundreds of systems: engines, hydraulics, fuel, navigation, communication. Pilots don't wait for passengers to scream "the engine sounds weird" to check if something's wrong. They have a dashboard with gauges for every critical system. Engine temperature, fuel pressure, hydraulic levels, navigation accuracy. If the oil pressure drops below a threshold, an alarm goes off before anything actually fails. The pilot can divert, investigate, or fix it mid-flight.

Monitoring is that dashboard. Without it, you're flying by looking out the window and hoping nothing looks wrong. With it, you see the warning lights before the plane falls out of the sky. The gauges are your metrics. The alarms are your alerts. The pilot's reaction is your incident response.

## 3. The Full Explanation — How It Actually Works

Monitoring a MERN backend means watching multiple layers at once because failures can happen anywhere. Think of it as concentric circles of visibility.

**Application monitoring** is the innermost layer — what your Express app actually does. You want to know when it throws errors, how long requests take, and which endpoints are slow. Tools like Sentry or Datadog APM hook into your Express middleware and capture every request, every error, and the full stack trace. They give you distributed tracing, which lets you follow a single request from the frontend through your Express routes, into MongoDB, and back out. This is how you answer "why did this specific user's request take 5 seconds?"

**Infrastructure monitoring** is the next layer — the machine your app runs on. CPU usage, memory consumption, disk I/O, network traffic. If CPU spikes to 100%, your app might be slow even if the code is perfect. If memory grows continuously, you have a memory leak. If disk is full, database writes start failing. Your cloud provider gives you basic metrics, but serious teams use Prometheus + Grafana to build custom dashboards that show infrastructure and application metrics side by side.

**Database monitoring** is critical because the database is almost always the bottleneck. For MongoDB, you need to watch slow queries, connection count, index usage, and operation latency. MongoDB Atlas provides a lot of this out of the box. The slow query log is gold — it shows you every query that took longer than your threshold (usually 100ms). If you see the same query appearing repeatedly, that's your performance problem. Connection count matters too — if you're hitting your connection limit, new requests wait or fail.

**Logging** is different from metrics. Metrics are numbers over time — error rate, response time. Logs are text records of what actually happened. A well-structured log entry includes the request ID, user ID, endpoint, params, and what went wrong. You ship these to a centralized service like Datadog, CloudWatch, or the ELK stack so you can search across all your servers. When an alert fires, logs are how you figure out what actually happened.

**Uptime monitoring** is the outermost layer — does your app respond at all? External services like UptimeRobot or Pingdom hit your `/health` endpoint every minute from multiple locations. If your server crashes or your network goes down, you know immediately even if your internal monitoring is down. This is your canary in the coal mine.

**Alerting** ties it all together. Metrics and logs are useless if nobody looks at them. Alerts are rules that say "if error rate goes above 1% for 5 minutes, page the on-call engineer." But you have to be careful — too many alerts and people ignore them. Good alerting means routing warnings to Slack, critical issues to PagerDuty, and grouping related alerts so one spike doesn't trigger 50 notifications.

The key insight is that each layer catches different problems. Application monitoring catches code bugs. Infrastructure monitoring catches resource exhaustion. Database monitoring catches query performance. Uptime monitoring catches total failures. You need all of them because you never know where the next problem will come from.

## 4. See It In Practice — Real Code or Queries

Here's how you actually instrument a MERN backend for monitoring.

**Application monitoring with Sentry:**

```javascript
// Initialize Sentry at the very top of your app
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // Capture 10% of transactions for performance
});

// Add Sentry middleware to Express
import express from 'express';
const app = express();

// Sentry handles request tracking and error capture automatically
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Your routes
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    res.json(user);
  } catch (error) {
    // Sentry captures this automatically, but you can add context
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Error handler must be after all routes
app.use(Sentry.Handlers.errorHandler());
```

**Health check endpoint:**

```javascript
app.get('/health', async (req, res) => {
  const checks = {
    api: 'ok',
    database: 'ok',
    redis: 'ok',
  };

  // Check database connectivity
  try {
    await mongoose.connection.db.admin().ping();
  } catch (error) {
    checks.database = 'error';
  }

  // Check Redis if you use it
  try {
    await redis.ping();
  } catch (error) {
    checks.redis = 'error';
  }

  // Return 503 if any critical dependency is down
  const hasErrors = Object.values(checks).some(status => status === 'error');
  const statusCode = hasErrors ? 503 : 200;

  res.status(statusCode).json({
    status: hasErrors ? 'degraded' : 'healthy',
    checks,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
```

**Structured logging with Winston:**

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Use it in your routes
app.get('/api/orders/:id', async (req, res) => {
  const requestId = req.headers['x-request-id'] || generateId();
  logger.info({
    message: 'Fetching order',
    requestId,
    userId: req.user?.id,
    orderId: req.params.id,
  });

  try {
    const order = await Order.findById(req.params.id);
    logger.info({
      message: 'Order fetched successfully',
      requestId,
      orderId: req.params.id,
    });
    res.json(order);
  } catch (error) {
    logger.error({
      message: 'Failed to fetch order',
      requestId,
      orderId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});
```

**MongoDB slow query monitoring:**

```javascript
// Enable profiling in MongoDB (run this once in your database)
// db.setProfilingLevel(1, { slowms: 100 })

// In your app, log slow queries
mongoose.connection.on('connected', () => {
  mongoose.connection.db.setProfilingLevel(1, { slowms: 100 });
});

// Periodically check the slow query log
setInterval(async () => {
  const slowQueries = await mongoose.connection.db
    .collection('system.profile')
    .find({ millis: { $gt: 100 } })
    .sort({ ts: -1 })
    .limit(10)
    .toArray();

  if (slowQueries.length > 0) {
    logger.warn({
      message: 'Slow queries detected',
      count: slowQueries.length,
      queries: slowQueries.map(q => ({
        ns: q.ns,
        millis: q.millis,
        query: q.query,
      })),
    });
  }
}, 60000); // Check every minute
```

**Prometheus metrics for Express:**

```javascript
import promBundle from 'express-prom-bundle';

const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  promClient: {
    collectDefaultMetrics: true,
  },
});

app.use(metricsMiddleware);

// Now you have metrics at /metrics
// Metrics include: http_request_duration_seconds, http_requests_total
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you monitor a MERN backend?**

I monitor at multiple layers because problems can happen anywhere. For application monitoring, I use Sentry or Datadog APM to capture errors, performance, and distributed traces. I instrument Express with their middleware so every request is tracked automatically. For infrastructure, I monitor CPU, memory, disk, and network — either through the cloud provider's dashboard or with Prometheus and Grafana for custom dashboards. For the database, I use MongoDB Atlas's built-in monitoring for slow queries, connection count, and operation latency. I enable profiling to log queries over 100ms. For logging, I use structured logging with Winston or Pino and ship logs to a centralized service like Datadog or CloudWatch. For uptime, I have an external service like UptimeRobot hit my `/health` endpoint every minute. For alerting, I set thresholds on error rate, response time, and resource usage, with warnings going to Slack and critical issues going to PagerDuty. The key is monitoring before problems occur — performance degradation should trigger alerts before users notice.

**Q: What metrics should you monitor for an Express backend?**

I monitor error rate as the percentage of 5xx responses and alert if it goes above 1%. For response time, I track p50, p95, and p99 latency, not just averages. I alert if p95 goes above 1 second because that's what most users experience. Throughput in requests per second helps with capacity planning — I watch trends to predict when I need to scale. Database query time is critical — I track slow query count and average query time. Memory usage in Node.js heap size and RSS tells me about memory leaks. Active connections for MongoDB and socket connections help me spot connection pool exhaustion. I also track business metrics like user signups and API usage because a sudden drop can indicate a problem even if technical metrics look fine. I use `express-prom-bundle` for Prometheus metrics or let the APM tool collect them automatically.

**Q: How do you implement health check endpoints?**

I implement a `/health` endpoint that checks critical dependencies — database connection, Redis if I use it, and the API itself. It tries to ping each dependency and marks it as error or ok. If any critical dependency fails, it returns a 503 status. If all pass, it returns 200. The response includes the individual check statuses, server uptime, and a timestamp. I keep it simple — only critical dependencies affect the health status. Non-critical services like email or external APIs don't cause a 503 because the app can function without them. Uptime monitoring services call this endpoint every minute from multiple locations. If the health check fails, I get an alert immediately. This catches total failures where the server is down or the network is unreachable, which internal monitoring might miss.

**Q: How do you set up alerting for a MERN backend?**

I alert on error rate spikes — more than 1% of 5xx errors over 5 minutes warrants investigation. For response time, I alert if p95 exceeds 1 second for 5 minutes. Database connection exhaustion is critical — I alert if connections exceed 80% of the limit. Memory leaks show up as heap size growing continuously over an hour, so I alert on that trend. Downtime triggers an alert if the health check fails for 2 consecutive checks. I also monitor business anomalies like a sudden drop in signups or API usage, which can indicate a problem before technical metrics show it. I use Sentry for error alerts, Datadog or Prometheus for metric alerts, and UptimeRobot for downtime alerts. Warnings go to Slack, critical issues go to PagerDuty. I prevent alert fatigue by grouping related alerts, setting appropriate thresholds, and only alerting on actionable issues. If an alert doesn't require immediate action, it's a dashboard metric, not an alert.

**Q: How do you monitor database performance in MongoDB?**

I use MongoDB Atlas's built-in monitoring dashboard, which shows slow queries, query performance, connection count, and operation latency. I enable profiling with a threshold of 100ms to log slow queries to the `system.profile` collection. I review this log weekly to find queries that need indexes. I monitor index usage — unused indexes waste write performance, so I remove them. For critical queries, I use `explain()` to verify they're using indexes efficiently and not doing full collection scans. I watch connection count to prevent connection pool exhaustion — if it approaches the limit, I either increase the limit or investigate why connections aren't being released. For self-hosted MongoDB, I use `mongostat` and `mongotop` for real-time monitoring. Slow queries are the number one cause of backend performance issues, so I alert on slow query count and investigate immediately when it spikes.

## 6. The Traps — What Goes Wrong in Production

**Only monitoring errors, not performance.** This is the most common trap. Your app can return 200 OK but take 10 seconds per request. Users leave before you see any error. You must monitor response time percentiles, not just error rate. Performance degrades before errors appear.

**Monitoring only averages, not percentiles.** Average response time hides outliers. If 99 requests take 100ms and 1 request takes 10 seconds, the average is 200ms — looks fine. But that one user had a terrible experience. Monitor p95 and p99 to see what the slowest users experience.

**Making health checks too complex.** If your health check depends on ten different services, any one of them being down marks your app as unhealthy. This creates false alarms and makes the health check unreliable. Only check truly critical dependencies — database, cache, maybe a message queue. External APIs and email services should not affect health status.

**Alert fatigue from too many alerts.** If you alert on every metric crossing any threshold, engineers get numb and ignore real problems. Group related alerts, set thresholds that require sustained problems (5 minutes, not 1 second), and route appropriately. Not everything needs to wake someone up at 3am.

**Not monitoring slow queries.** A single unindexed query on a large collection can slow down your entire database. All queries share the same connection pool and resources. One bad query affects everyone. Enable slow query logging and review it regularly.

**Ignoring memory leaks in Node.js.** Node.js has a garbage collector, but it's not magic. Closures holding large objects, event emitter listeners that never get removed, and growing caches can cause memory to increase continuously. Monitor heap size over time — if it grows without bound, you have a leak.

**Shipping logs to the same server as your app.** If your server crashes, you lose the logs that might explain why it crashed. Ship logs to a centralized service immediately. Disk fills up, servers get wiped — logs should survive the app.

**Not correlating metrics across layers.** Response time spikes might be caused by database slow queries, which might be caused by missing indexes, which might be caused by a recent schema change. If you only look at one layer, you never see the chain of causality. Distributed tracing and dashboards that show all layers together help you connect the dots.

## 7. Compare With Related Concepts

**Monitoring vs logging.** Logging is recording what happened — text entries with details. Monitoring is measuring how the system is doing — numbers over time. You need both. Logs tell you why something happened. Metrics tell you that something is happening. Monitoring without logging means you know there's a problem but not what caused it. Logging without monitoring means you have the data but nobody looks at it until after a disaster.

**Uptime monitoring vs health checks.** Uptime monitoring is external — a service outside your infrastructure hits your endpoint from the public internet. It catches network failures, DNS problems, and total server crashes. Health checks are internal — your app checks its own dependencies. Uptime monitoring tells you if users can reach you. Health checks tell you if your app is functional internally. You need both because internal health doesn't guarantee external reachability.

**APM vs infrastructure monitoring.** APM (Application Performance Monitoring) watches your code — request durations, error rates, database queries. Infrastructure monitoring watches your machines — CPU, memory, disk, network. APM tells you if your code is slow. Infrastructure monitoring tells you if your server is overloaded. A slow query might be APM. A CPU spike from a runaway process is infrastructure. You need both because code problems and machine problems look similar from the user's perspective — slow response times.

**Metrics vs traces.** Metrics are aggregated numbers — requests per second, average response time. Traces are individual request journeys through your system. Metrics tell you what's happening overall. Traces tell you why a specific request was slow. Metrics are for dashboards and alerts. Traces are for debugging. You use metrics to find a problem, then traces to understand it.

**Synchronous vs asynchronous monitoring.** Synchronous monitoring is your app collecting data as it processes requests — APM, metrics middleware. Asynchronous monitoring is background processes collecting data — scraping `/metrics` endpoint, periodic database profiling. Synchronous is more accurate but adds overhead. Asynchronous is lighter but might miss brief problems. Most systems use both.

## 8. 🧠 The Memory Hook — What Sticks

Monitor at multiple layers — application, infrastructure, database, logs, uptime, alerts. Each layer catches different failures. You find out about problems from your systems, not from your users.
