# LLD Interview Designs

Use this loop to make the object model visible before jumping into classes or pseudocode. The goal is a design whose responsibilities, state changes, and extension points are easy to explain.

## 13-point answer loop

1. Clarify requirements
2. Identify entities
3. Define relationships
4. Define interfaces and abstractions
5. Design classes
6. Decide responsibilities
7. Apply design patterns where useful
8. Handle important workflows
9. Handle edge cases
10. Discuss extensibility
11. Discuss concurrency where relevant
12. Write the core class/pseudocode design
13. Discuss trade-offs

## Designs

| Design | Interview focus |
|---|---|
| [Parking Lot](parking-lot.md) | Allocation, tickets, pricing, and capacity |
| [Elevator](elevator.md) | Requests, scheduling, and car state |
| [Vending Machine](vending-machine.md) | Inventory, payment, and state transitions |
| [Splitwise](splitwise.md) | Expenses, balances, and settlement |
| [BookMyShow](bookmyshow.md) | Seats, holds, bookings, and payments |
| [ATM](atm.md) | Authentication, cash dispensing, and transactions |
| [Car Rental](car-rental.md) | Reservations, fleet availability, and returns |
| [Logger](logger.md) | Log levels, sinks, and configuration |
| [Notification System](notification-system.md) | Channels, preferences, and delivery strategies |
| [Cache](cache.md) | Eviction policies, storage, and concurrency |
