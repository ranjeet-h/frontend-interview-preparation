# Design a booking system

## Detailed explanation

Design a booking system is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Design data flow, APIs, storage, scaling, failure handling, and observability together.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Clarify requirements and scale.
- Define APIs and data model.
- Choose storage, cache, queues, and workers.
- Plan consistency, failure handling, and security.
- Add observability and rollout strategy.

## 4. Visual / analogy

```txt
Clients -> API -> services -> database/cache/queue -> observability
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply backend system design rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, design a booking system affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you prevent double-booking the same time slot?
- **The Engine Mechanism (Why it behaves this way):** Double-booking is prevented with a uniqueness constraint on (resource_id, start_time) or (resource_id, date, time_slot). When a booking request arrives, the database checks for overlapping existing bookings using a range query: WHERE resource_id = X AND start_time < requested_end AND end_time > requested_start. If a conflict exists, the booking is rejected. The check and insert are wrapped in a transaction with row-level locking (SELECT FOR UPDATE on the resource row) to prevent race conditions. For high-concurrency resources (popular restaurants, concert tickets), use a Redis-based slot counter with atomic decrement.
- **The Unforgettable Mental Model:** The **Meeting Room Calendar**. Each room (resource) has a calendar. When you book 2-3pm, the receptionist (database) checks if anything is already scheduled that overlaps. If the room is free, they write your booking. Two people can't book the same slot because the receptionist handles one request at a time (locking).
- **The Trap:** Checking availability and creating the booking as separate operations without a transaction. Two concurrent requests can both see the slot as available and both succeed. Always wrap the check and insert in a single transaction.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd prevent double-booking with a database uniqueness constraint on (resource_id, start_time) and an overlap check query: WHERE resource_id = X AND start_time < requested_end AND end_time > requested_start. The check and insert are in a single transaction with SELECT FOR UPDATE on the resource row to prevent race conditions. For high-concurrency scenarios, I'd use a Redis slot counter with atomic Lua script decrement. The database constraint is the final safety net — even if the application check fails, the constraint prevents duplicates."

#### How do you handle booking expiration (hold time)?
- **The Engine Mechanism (Why it behaves this way):** When a user selects a slot, it's placed on "hold" for a TTL (10-15 minutes) while they complete payment. The hold is stored in Redis with an expiration (SET key value EX 900). The slot is marked as "held" in the database with an expires_at timestamp. Other users see the slot as unavailable during the hold period. If payment completes within the hold time, the hold converts to a confirmed booking. If the hold expires, Redis auto-deletes the key and a background job releases the slot. A WebSocket event notifies other users when a held slot becomes available.
- **The Unforgettable Mental Model:** The **Shopping Cart Timer**. When you add an item to your cart, it's reserved for 15 minutes. A countdown timer shows how long you have to checkout. If you don't checkout in time, the item goes back on the shelf and someone else can buy it. Other shoppers see the item as "reserved" during the hold period.
- **The Trap:** Not releasing expired holds. If the hold expiration job fails, slots remain permanently unavailable. Always use Redis TTL as the primary expiration mechanism (automatic) with a database cleanup job as a safety net.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: When a user selects a slot, I place it on hold in Redis with a 15-minute TTL and mark it as 'held' in the database with an expires_at timestamp. Other users see it as unavailable. If payment completes, the hold converts to a confirmed booking. Redis TTL auto-expires the hold — no cleanup job needed for the primary mechanism. A background job periodically releases database holds where expires_at < NOW() as a safety net. When a hold expires, a WebSocket event notifies waiting users that the slot is available."

#### How do you handle recurring bookings (weekly meetings, monthly subscriptions)?
- **The Engine Mechanism (Why it behaves this way):** Recurring bookings are modeled as a booking_series (id, resource_id, user_id, start_time, end_time, recurrence_rule, end_date) with individual booking instances (id, series_id, date, start_time, end_time, status) generated from the series. The recurrence rule follows the iCalendar RRULE standard (FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20251231). Instances are generated lazily (on-demand when querying) or eagerly (pre-generated for the next 30 days). Modifying a single instance creates an exception record that overrides the series rule for that date. Cancelling the entire series marks the series as cancelled and removes all future instances.
- **The Unforgettable Mental Model:** The **TV Show Schedule**. A show (booking series) airs every Monday at 8pm (recurrence rule). Each episode is an instance. If one episode is pre-empted (exception), that specific date is different. If the show is cancelled (series cancellation), all future episodes stop. The TV guide (query) generates upcoming episodes from the schedule rule.
- **The Trap:** Pre-generating all recurring instances indefinitely. A daily recurring booking for a year creates 365 records. If the series is modified, all 365 records need updating. Generate instances lazily or with a limited horizon (next 30 days).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd model recurring bookings as a booking_series with an iCalendar RRULE and individual instances generated from it. Instances are generated lazily on query or eagerly for the next 30 days — not indefinitely. Modifying a single instance creates an exception record that overrides the series for that date. Cancelling the series marks it as cancelled and removes future instances. The RRULE standard handles complex patterns (every 2nd Tuesday, except holidays). This keeps storage efficient while supporting flexible recurrence patterns."

#### How do you handle timezone-aware bookings?
- **The Engine Mechanism (Why it behaves this way):** All booking times are stored in UTC in the database. The resource's timezone is stored separately (e.g., "America/New_York"). When a user creates a booking, their local time is converted to UTC using the resource's timezone. When displaying bookings, UTC times are converted to the user's local timezone. Daylight Saving Time transitions are handled by the timezone library (moment-timezone, date-fns-tz) — a booking at 2:30 AM on the DST transition day is unambiguous in UTC. The API accepts times in the user's timezone with a timezone identifier, and the server converts to UTC for storage.
- **The Unforgettable Mental Model:** The **World Clock**. A meeting scheduled for 9am New York time is 2pm London time and 11pm Tokyo time. The master clock (database) always shows UTC. Each participant's clock (display) shows their local time. When DST changes, the world clock doesn't change — only the offset between local and UTC changes.
- **The Trap:** Storing times in local timezone without the timezone identifier. "9:00 AM" is ambiguous — is it EST or EDT? Always store in UTC and keep the resource's timezone separately for conversion.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: All booking times are stored in UTC. The resource's timezone is stored separately. When a user books, their local time is converted to UTC using the resource's timezone. Display converts UTC back to the user's local timezone. DST transitions are handled by the timezone library — UTC times are unambiguous. The API accepts times with a timezone identifier (e.g., "2025-03-15T09:00:00-04:00") and converts to UTC. This ensures bookings are correct regardless of where the user or resource is located."

#### How do you handle booking cancellations and no-shows?
- **The Engine Mechanism (Why it behaves this way):** Cancellation policies are defined per resource: free cancellation until X hours before, partial refund until Y hours, no refund after. When a user cancels, the system checks the policy, calculates any refund, releases the slot, and updates the booking status. No-shows are detected when the booking time passes without check-in. A background job marks bookings as "no-show" after a grace period (15 minutes past start time). No-show penalties (fees, account restrictions) are applied based on the resource's policy. Cancellation and no-show events are logged for analytics.
- **The Unforgettable Mental Model:** The **Hotel Cancellation Policy**. Free cancellation until 48 hours before check-in. 50% refund until 24 hours. No refund after. If you don't show up (no-show), you're charged the full amount. The front desk (system) automatically applies the policy based on when you cancel.
- **The Trap:** Not handling no-shows automatically. Without a background job, no-show bookings remain in "confirmed" status indefinitely, blocking the slot and skewing analytics. Always auto-detect and mark no-shows.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cancellation policies are defined per resource with time-based rules (free until X hours, partial until Y, none after). On cancellation, the system checks the policy, calculates refunds, releases the slot, and updates status. No-shows are detected by a background job that runs every 15 minutes — it marks confirmed bookings where start_time + grace_period < NOW() and no check-in occurred. No-show penalties are applied automatically. All cancellation and no-show events are logged for analytics and user behavior tracking."

#### How do you design the booking search and availability API?
- **The Engine Mechanism (Why it behaves this way):** The availability API accepts resource_id, date range, and optionally party_size. It returns available time slots by: (1) Loading the resource's schedule (working hours, break times); (2) Loading existing bookings and holds for the date range; (3) Computing available slots by subtracting booked/held times from working hours; (4) Filtering by party_size (some slots only accommodate certain sizes); (5) Returning slots in a structured format. For performance, availability is pre-computed and cached in Redis for the next 7 days. The search API supports filtering by location, category, rating, and availability.
- **The Unforgettable Mental Model:** The **Restaurant Reservation Book**. The host (API) looks at the restaurant's hours (schedule), checks which tables are already booked (existing bookings), sees which tables are held for pending reservations (holds), and tells you what times are available. They also check if the table fits your party size.
- **The Trap:** Computing availability on every request by scanning all bookings. This is O(n) per request and slow for popular resources. Pre-compute and cache availability for the next 7 days, updating it incrementally when bookings change.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The availability API loads the resource's schedule, existing bookings, and holds for the requested date range, then computes available slots by subtracting booked times from working hours. Results are filtered by party size and returned in a structured format. For performance, I'd pre-compute availability for the next 7 days and cache it in Redis. When a booking is created or cancelled, the cache is updated incrementally. The search API supports location, category, rating, and availability filtering with pagination."

#### How do you handle overbooking strategies (airlines, hotels)?
- **The Engine Mechanism (Why it behaves this way):** Overbooking intentionally accepts more bookings than capacity, based on historical no-show rates. The overbooking limit = capacity × (1 + no_show_rate). For example, if a flight has 100 seats and a 5% no-show rate, the system accepts 105 bookings. When more guests show up than capacity, the system triggers an overflow protocol: offer compensation (voucher, upgrade), rebook on the next available slot, or partner with a nearby resource. The overbooking algorithm uses machine learning to predict no-show rates based on historical data, booking lead time, day of week, and customer history.
- **The Unforgettable Mental Model:** The **Restaurant's Extra Tables**. The restaurant knows that 10% of reservations don't show up. So they accept 110 reservations for 100 tables. Most nights, everyone fits. On the rare night when all 110 show up, the restaurant offers free dessert and a wait at the bar, or recommends a partner restaurant nearby.
- **The Trap:** Overbooking without an overflow protocol. If everyone shows up and you have no plan, you damage customer trust and face legal liability. Always have a compensation and rebooking strategy.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Overbooking uses historical no-show data to set an overbooking limit — capacity × (1 + no_show_rate). The algorithm considers booking lead time, day of week, and customer history to predict no-show probability. When capacity is exceeded, an overflow protocol activates: offer compensation (vouchers, upgrades), rebook on the next available slot, or partner with nearby resources. I'd implement this as a configurable policy per resource, with strict caps on overbooking percentage to limit risk."

## 8. Active recall test

1. **How do you prevent double-booking a time slot?**
   - **Explanation:** Use a database uniqueness constraint on (resource_id, start_time) and an overlap check query within a transaction with SELECT FOR UPDATE. For high concurrency, use Redis slot counters with atomic Lua script decrement.

2. **How does booking hold/expiration work?**
   - **Explanation:** When a user selects a slot, it's held in Redis with a TTL (15 min) and marked as 'held' in the database. If payment completes, the hold converts to a booking. Redis TTL auto-expires. A background job releases expired database holds.

3. **How do you model recurring bookings efficiently?**
   - **Explanation:** Use a booking_series with an iCalendar RRULE and generate individual instances lazily or for a limited horizon (30 days). Exceptions override the series for specific dates. Don't pre-generate all instances indefinitely.

4. **How do you handle timezones in bookings?**
   - **Explanation:** Store all times in UTC. Store the resource's timezone separately. Convert user local time to UTC on creation, and UTC to user local time on display. Use timezone libraries for DST handling.

5. **How do you detect no-shows automatically?**
   - **Explanation:** A background job runs every 15 minutes and marks confirmed bookings as 'no-show' where start_time + grace_period < NOW() and no check-in occurred. No-show penalties are applied based on the resource's policy.

6. **How do you optimize availability queries?**
   - **Explanation:** Pre-compute availability for the next 7 days and cache in Redis. Update the cache incrementally when bookings change. Don't compute availability on every request by scanning all bookings.

7. **How does overbooking work and what are the risks?**
   - **Explanation:** Accept more bookings than capacity based on historical no-show rates (capacity × (1 + no_show_rate)). Use ML to predict no-show probability. Always have an overflow protocol (compensation, rebooking) for when everyone shows up.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a booking system in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a booking system in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
