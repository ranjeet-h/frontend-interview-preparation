# Request Throttling

## Detailed explanation

Request throttling slows request processing to a controlled rate instead of simply allowing or rejecting every request.

## 1. One-line mental model

Throttle means pace traffic so the system stays stable.

## 2. Problem it solves

Some workloads should be slowed rather than dropped, especially queues, background processing, and expensive integrations.

## 3. Core idea

- Throttling can delay, queue, or shape traffic.
- It protects downstream services.
- It differs from rate limiting, which often rejects over-limit requests.
- Use backpressure when workers are saturated.
- Communicate retry timing when clients must wait.

## 4. Visual / analogy

```txt
Water valve: reduce flow instead of cutting pipe.
```

## 5. Minimal example

```txt
await limiter.schedule(() => sendEmail(job));
```

## 6. Real-world example

Email provider allows 100 messages per second, so backend throttles outbound email jobs.

## 7. Common interview questions

#### What is request throttling?
- **The Engine Mechanism (Why it behaves this way):** Request throttling slows request processing to a controlled rate instead of simply allowing or rejecting requests. While rate limiting says "you've exceeded your quota, come back later," throttling says "I'll process your requests, but at a controlled pace." Throttling can delay requests in a queue, shape traffic using token bucket or leaky bucket algorithms, or apply backpressure when downstream services are saturated. The backend uses a scheduler or queue to pace request execution, ensuring the system stays stable under load rather than rejecting requests outright.
- **The Unforgettable Mental Model:** Throttling is like a **water valve** — it reduces the flow rate instead of shutting off the pipe entirely. Rate limiting is the shutoff valve; throttling is the flow regulator.
- **The Trap:** Confusing throttling with rate limiting. Rate limiting rejects over-limit requests (429); throttling delays them. They serve different purposes and can be used together.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Request throttling slows request processing to a controlled rate instead of rejecting over-limit requests. While rate limiting returns 429 when the quota is exceeded, throttling queues or delays requests to maintain a steady processing pace. I use throttling for outbound integrations with rate-limited APIs (like email providers), for background job processing, and for protecting downstream services from traffic spikes. Throttling uses algorithms like token bucket or leaky bucket to pace execution."

#### Why does request throttling matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Throttling matters because some workloads should be slowed rather than dropped. Outbound integrations (email, SMS, payment gateways) have their own rate limits that your backend must respect. Background processing (image resizing, report generation) should proceed at a pace that doesn't saturate CPU or memory. Queue consumers should process at a rate that downstream services can handle. Throttling prevents cascading failures by controlling the flow of work through the system, ensuring stability even under heavy load.
- **The Unforgettable Mental Model:** Throttling is like a **conveyor belt speed control**. If the belt moves too fast, packages pile up at the packing station. Slowing the belt keeps the whole line flowing smoothly.
- **The Trap:** Using throttling when rate limiting is more appropriate. If the goal is to prevent abuse, rate limiting (rejecting excess) is better than throttling (delaying excess), which still consumes resources.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Throttling matters because some workloads should be paced rather than rejected. Outbound integrations have their own rate limits we must respect. Background processing should proceed at a pace that doesn't saturate resources. Throttling prevents cascading failures by controlling work flow through the system. I use it for email sending (respecting provider limits), job processing (preventing CPU saturation), and API calls to external services (avoiding downstream overload)."

#### What bugs happen when throttling is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor throttling causes several issues. Not throttling outbound requests causes external API rate limit violations, resulting in blocked accounts or failed deliveries. Throttling too aggressively causes request queues to grow indefinitely, increasing latency and eventually exhausting memory. Not communicating retry timing to clients leaves them retrying immediately, compounding the load. Throttling synchronous requests (API responses) instead of asynchronous jobs causes unacceptable latency for end users. Not implementing backpressure means the queue grows faster than it drains, eventually crashing the system.
- **The Unforgettable Mental Model:** Poor throttling is like a **traffic light stuck on red**. Cars pile up behind it, the queue grows indefinitely, and eventually the entire intersection gridlocks.
- **The Trap:** Throttling user-facing API requests instead of background jobs. Users expect fast responses — throttling their requests causes timeouts and poor UX.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor throttling causes external API violations from unpaced outbound requests, growing queues from aggressive throttling, and cascading failures from missing backpressure. The worst bug is throttling synchronous user-facing requests — users experience timeouts and poor UX. I throttle asynchronous jobs and outbound integrations, not user-facing API responses. I also implement backpressure to prevent queue overflow and communicate retry timing to clients when delays are expected."

#### How does throttling affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** For synchronous throttling, the frontend experiences delayed responses — requests take longer because the server paces processing. The frontend should implement timeouts and show loading states for extended waits. For asynchronous throttling (queued jobs), the frontend receives a 202 Accepted response with a job ID and polls for completion. The frontend shows progress indicators and handles the eventual completion or failure. Throttling headers can inform the frontend about expected wait times.
- **The Unforgettable Mental Model:** Throttling for the frontend is like a **restaurant with a waitlist**. You don't get rejected — you just wait your turn. The host tells you the estimated wait time.
- **The Trap:** Not implementing request timeouts for throttled endpoints. If the server delays a response for 60 seconds, the frontend's default timeout (often 30 seconds) fails the request before the server responds.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For synchronous throttling, the frontend experiences delayed responses and should implement appropriate timeouts and loading states. For asynchronous throttling, the frontend receives 202 Accepted with a job ID and polls for completion. I design the frontend to handle extended wait times with progress indicators and user-friendly messages. I also set request timeouts that account for expected throttling delays — if the server may take 60 seconds, the frontend timeout should be longer."

#### How would you test throttling behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing throttling involves sending bursts of requests and verifying they're paced correctly. Send 100 requests instantly and verify they're processed at the configured rate (e.g., 10 per second). Verify total processing time matches the expected duration (100 requests at 10/sec = 10 seconds). Test that no requests are dropped — all should eventually be processed. Test backpressure by sending requests faster than the throttle rate and verifying the queue grows but doesn't overflow. Test that throttling resets correctly after idle periods.
- **The Unforgettable Mental Model:** Testing throttling is like **testing a metronome**. Send a burst of beats and verify they come out at the configured tempo, not all at once.
- **The Trap:** Only testing with slow request rates. Throttling bugs appear under burst load — test with rapid request bursts to verify pacing behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test throttling by sending bursts of requests and verifying they're processed at the configured rate. I send 100 requests instantly and verify they're paced at the expected rate — e.g., 10 per second over 10 seconds. I verify no requests are dropped, all eventually complete. I test backpressure by sending faster than the throttle rate and verifying the queue grows but doesn't overflow. I also test that throttling resets after idle periods. The key is testing under burst load, not just steady-state traffic."

## 8. Active recall test

1. **Explain request throttling without looking at notes.**
   - **Explanation:** Throttling slows request processing to a controlled rate instead of rejecting over-limit requests. It queues or delays requests to maintain steady processing pace, using algorithms like token bucket or leaky bucket. Used for outbound integrations, background jobs, and protecting downstream services.

2. **Give one production bug related to throttling.**
   - **Explanation:** Not throttling outbound email requests causes the email provider to block the account for exceeding their rate limit. Thousands of queued emails fail, and customer notifications are lost until the account is unblocked.

3. **Give one API example where throttling matters.**
   - **Explanation:** An email sending service limits outbound requests to 100/second. The backend throttles email jobs to this rate, queuing excess jobs and processing them at the allowed pace. No emails are lost, and the provider account stays in good standing.

4. **Explain how a frontend client should handle throttling.**
   - **Explanation:** For synchronous throttling: implement extended timeouts and show loading states. For asynchronous throttling: handle 202 Accepted with job ID, poll for completion, and show progress indicators. Set timeouts that account for expected throttling delays.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Request Throttling is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Request Throttling in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Request Throttling in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
