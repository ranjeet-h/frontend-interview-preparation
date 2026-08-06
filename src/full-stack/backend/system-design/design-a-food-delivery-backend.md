# Design a food delivery backend

## Detailed explanation

Design a food delivery backend is a backend system design exercise that checks API design, data modeling, scaling, reliability, and operational thinking. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, design a food delivery backend affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you match orders with delivery drivers?
- **The Engine Mechanism (Why it behaves this way):** When an order is ready for pickup, the system searches for available drivers within a radius of the restaurant. Drivers are ranked by distance to restaurant, current load (number of active deliveries), and acceptance rate. The closest available driver is assigned. For efficiency, batch matching assigns multiple orders from the same restaurant or nearby restaurants to one driver (stacked deliveries). The matching algorithm considers: driver's current location, order pickup time, delivery destination, and traffic conditions. If no driver accepts within a timeout, the search radius expands and/or a delivery fee incentive is added.
- **The Unforgettable Mental Model:** The **Pizza Delivery Dispatcher**. When a pizza is ready, the dispatcher looks for the nearest available driver. If two orders are going to the same neighborhood, they give both to one driver (batching). If no driver is nearby, they offer a bonus for the trip. The dispatcher tracks all drivers on a map and assigns optimally.
- **The Trap:** Assigning the closest driver without considering their current load. The closest driver might already have 3 deliveries, while a slightly farther driver is free. Always factor in current load and estimated completion time.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: When an order is ready, I search for available drivers within a radius using geospatial indexing. Drivers are ranked by distance to restaurant, current load, and acceptance rate. I support batch matching — assigning multiple orders from the same or nearby restaurants to one driver for efficiency. The algorithm considers driver location, pickup time, delivery destination, and traffic. If no driver accepts, the radius expands and/or a delivery incentive is added. Matching is event-driven — triggered when the restaurant marks the order as ready."

#### How do you handle real-time order tracking for the customer?
- **The Engine Mechanism (Why it behaves this way):** Order status flows through: confirmed → preparing → ready_for_pickup → picked_up → en_route → delivered. Each status change is published to a WebSocket channel (order_id) and pushed to the customer's app. The driver's location is streamed during the en_route phase via WebSocket. The customer sees: order confirmation, estimated prep time (from restaurant), driver assignment, driver location on map, and ETA. ETA is recalculated every 30 seconds using the routing engine. Status updates are also sent via push notification as a fallback if the WebSocket connection drops.
- **The Unforgettable Mental Model:** The **Domino's Pizza Tracker**. You see each step: order confirmed → being made → in the oven → quality check → out for delivery → delivered. During delivery, you see the driver's car moving on a map with an estimated arrival time. If the app closes, you still get text notifications for each step.
- **The Trap:** Only updating status when the driver manually changes it. Drivers forget to update status. Use automatic status detection — GPS proximity to restaurant triggers "picked_up," GPS proximity to customer triggers "delivered."
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Order status flows through a state machine: confirmed → preparing → ready_for_pickup → picked_up → en_route → delivered. Each transition is published via WebSocket to the customer's app. During en_route, the driver's location streams every 3 seconds for real-time map display. ETA recalculates every 30 seconds. I'd also use automatic status detection — GPS proximity to the restaurant triggers 'picked_up,' proximity to the customer triggers 'delivered.' Push notifications serve as a fallback if the WebSocket drops."

#### How do you estimate delivery time accurately?
- **The Engine Mechanism (Why it behaves this way):** Delivery time = prep_time + pickup_travel_time + delivery_travel_time + buffer. Prep time is learned from historical data per restaurant (average prep time for similar orders). Travel times come from a routing engine (OSRM, Google Maps) with real-time traffic data. A buffer (20-30%) accounts for variability (traffic, parking, finding the address). Machine learning models improve estimates over time by learning from actual delivery durations. The estimate is updated dynamically as the order progresses — once the driver picks up, the estimate updates to just delivery_travel_time + buffer.
- **The Unforgettable Mental Model:** The **Weather Forecast**. The initial forecast (estimate) uses historical patterns (average prep time) and current conditions (traffic). As the day progresses, the forecast updates with actual data (driver picked up, current location). A margin of error (buffer) accounts for unexpected storms (traffic jams).
- **The Trap:** Using static prep times for all restaurants. A fast-food restaurant takes 5 minutes, a fine-dining restaurant takes 30 minutes. Always use per-restaurant historical prep times and update estimates dynamically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Delivery time = prep_time + pickup_travel + delivery_travel + buffer. Prep time comes from per-restaurant historical averages. Travel times use a routing engine with real-time traffic. A 20-30% buffer accounts for variability. ML models improve estimates by learning from actual delivery durations. The estimate updates dynamically — once the driver picks up, it recalculates to just delivery time. I'd also factor in time of day, weather, and special events that affect traffic and restaurant speed."

#### How do you handle restaurant menu and availability?
- **The Engine Mechanism (Why it behaves this way):** Menus are stored with hierarchical structure: restaurant → categories → items → variants (size, extras). Each item has availability status, price, and preparation time. Restaurants can toggle items on/off in real-time (86'd items). The menu is cached in Redis with a short TTL (1-5 minutes) and invalidated when the restaurant updates it. When a customer adds items to cart, the system validates availability and price at checkout time (not at cart-add time) to prevent ordering unavailable items. Menu updates are pushed to connected customers viewing the restaurant via WebSocket.
- **The Unforgettable Mental Model:** The **Restaurant Chalkboard**. The menu is written on a chalkboard (database). When an item runs out, the chef erases it (toggle off). The waiter (cache) memorizes the menu but checks the chalkboard before taking your order (checkout validation). If the menu changes while you're looking at it, the waiter tells you (WebSocket update).
- **The Trap:** Validating menu items only when added to cart. An item could become unavailable between cart-add and checkout. Always validate at checkout time against the current menu state.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Menus are hierarchical: restaurant → categories → items → variants. Each item has availability, price, and prep time. Restaurants can toggle items on/off in real-time. The menu is cached in Redis with a 1-5 minute TTL, invalidated on updates. Cart validation happens at checkout, not at cart-add, to catch items that became unavailable. Menu updates are pushed via WebSocket to customers currently viewing the restaurant. I'd also support scheduled availability (breakfast menu only 7-11am) and location-specific menus."

#### How do you handle order cancellations and refunds?
- **The Engine Mechanism (Why it behaves this way):** Cancellation policy depends on order state: free cancellation before restaurant accepts, partial refund after acceptance (restaurant may have started preparing), no refund after food is prepared. The cancellation flow: (1) Validate state and policy; (2) Notify restaurant; (3) Release assigned driver; (4) Process refund based on policy; (5) Update order status. If the driver is already en route to the restaurant, a cancellation fee may apply to compensate the driver. Refunds are processed through the payment provider with idempotency. Cancellation reasons are tracked for analytics.
- **The Unforgettable Mental Model:** The **Restaurant Cancellation Policy**. Before the kitchen starts cooking, you can cancel for free. Once cooking starts, you pay for ingredients. Once the food is plated, you pay the full amount. If the delivery driver is already on the way, you also compensate them for their time.
- **The Trap:** Not compensating the driver on late cancellations. If a driver has already traveled to the restaurant, they've incurred time and fuel costs. Always factor driver compensation into the cancellation policy.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cancellation policy is state-dependent: free before restaurant acceptance, partial after (restaurant may have started prep), none after food is prepared. The flow: validate state, notify restaurant, release driver, process refund, update status. If the driver is en route, a cancellation fee compensates them for time and fuel. Refunds go through the payment provider with idempotency. Cancellation reasons are tracked for analytics — frequent cancellations from a restaurant or customer trigger investigation."

#### How do you handle multiple restaurants in a single order (group orders)?
- **The Engine Mechanism (Why it behaves this way):** Group orders allow multiple people to add items to a shared cart from the same restaurant. A group order has a host (creator) and participants. Each participant adds items independently. The host finalizes and places the order. Payment can be split (each pays for their items) or host-pays-all. For multi-restaurant orders (rare, complex), each restaurant creates a sub-order with its own preparation timeline. Drivers may need to pick up from multiple restaurants. The system coordinates pickup timing so all food arrives warm. Multi-restaurant orders have higher delivery fees and longer ETAs.
- **The Unforgettable Mental Model:** The **Office Lunch Order**. One person (host) starts a group order and shares the link. Everyone adds their own items. The host reviews and places the order. Payment is split — everyone pays for their own lunch. The restaurant prepares everything together and one driver delivers the whole order.
- **The Trap:** Allowing multi-restaurant orders without coordination. If Restaurant A takes 15 minutes and Restaurant B takes 30 minutes, the food from A gets cold waiting for B. Always coordinate pickup timing or use separate deliveries.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Group orders let multiple people add items to a shared cart from one restaurant. The host creates the order, shares a link, participants add items, and the host finalizes. Payment can be split or host-pays-all. For multi-restaurant orders, each restaurant gets a sub-order with its own timeline. The system coordinates pickup timing — the driver picks up from the slower restaurant first, then the faster one, so all food arrives warm. Multi-restaurant orders have higher fees and longer ETAs to account for complexity."

#### How do you scale the system during peak hours (lunch/dinner rush)?
- **The Engine Mechanism (Why it behaves this way):** Peak scaling: (1) Pre-warm restaurant menus and driver locations in Redis before peak hours; (2) Scale WebSocket connection servers and matching workers based on predicted demand; (3) Queue order processing — orders are accepted but processed asynchronously; (4) Dynamic delivery fee adjustment — higher fees during peak to balance supply/demand; (5) Restaurant capacity limits — restaurants can set max concurrent orders to prevent kitchen overload; (6) Driver incentive zones — bonus pay for drivers in high-demand areas. Predictive scaling uses historical order patterns to pre-scale infrastructure 30 minutes before expected peaks.
- **The Unforgettable Mental Model:** The **Restaurant Rush Hour**. Before lunch, the restaurant preps ingredients (pre-warm cache), calls in extra staff (scale servers), and puts a sign saying "30-minute wait" (capacity limits). They charge a small rush fee (dynamic pricing) and offer bonuses to extra delivery drivers (incentive zones).
- **The Trap:** Reactively scaling after the peak starts. By the time auto-scaling kicks in, the system is already overwhelmed. Use predictive scaling based on historical patterns to pre-scale 30 minutes before expected peaks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd use predictive scaling — historical order patterns trigger infrastructure scaling 30 minutes before expected peaks. Menus and driver locations are pre-warmed in Redis. WebSocket servers and matching workers scale based on predicted demand. Order processing is queued to prevent overload. Dynamic delivery fees balance supply/demand. Restaurants set max concurrent orders to prevent kitchen overload. Driver incentive zones attract more drivers to high-demand areas. Circuit breakers protect downstream services (payment, routing) from overload."

## 8. Active recall test

1. **How do you match orders with delivery drivers?**
   - **Explanation:** Search for available drivers within a radius using geospatial indexing. Rank by distance to restaurant, current load, and acceptance rate. Support batch matching for multiple orders from the same area. Expand radius or add incentives if no driver accepts.

2. **How do you provide real-time order tracking?**
   - **Explanation:** Order status flows through a state machine, published via WebSocket to the customer. Driver location streams every 3 seconds during en_route. ETA recalculates every 30 seconds. Use GPS proximity for automatic status detection. Push notifications as fallback.

3. **How do you estimate delivery time accurately?**
   - **Explanation:** prep_time (per-restaurant historical average) + pickup_travel + delivery_travel (routing engine with traffic) + buffer (20-30%). ML models improve estimates over time. Update dynamically as the order progresses.

4. **Why validate menu items at checkout, not at cart-add?**
   - **Explanation:** Items can become unavailable between cart-add and checkout. Checkout-time validation ensures the order only contains available items at current prices. Menu is cached in Redis with short TTL and invalidated on updates.

5. **How do you handle order cancellations fairly?**
   - **Explanation:** State-dependent policy: free before restaurant acceptance, partial after, none after prep. If driver is en route, a cancellation fee compensates them. Refunds through payment provider with idempotency. Track cancellation reasons for analytics.

6. **How do group orders work?**
   - **Explanation:** Host creates a shared cart, participants add items, host finalizes. Payment can be split or host-pays-all. For multi-restaurant orders, each restaurant gets a sub-order with coordinated pickup timing so all food arrives warm.

7. **How do you scale during peak hours?**
   - **Explanation:** Predictive scaling 30 minutes before peaks based on historical patterns. Pre-warm cache, scale workers, queue order processing, dynamic delivery fees, restaurant capacity limits, and driver incentive zones. Use circuit breakers for downstream services.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Design a food delivery backend in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Design a food delivery backend in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
