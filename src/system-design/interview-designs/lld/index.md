# LLD Interview Designs

Low-level design asks a different question than high-level design:

```text
HLD asks:  which services/components do we need, and how do they communicate?
LLD asks:  which objects/classes do we need, and how do they collaborate?
```

Use one **repeatable default path**, then adapt when the interviewer redirects you — the same idea as the HLD framework (Requirements → Estimation → API → HLD → Database → Deep Dive → Wrap-up). Every design in this section follows this sequence.

## The 8-phase LLD path

```text
1. Requirements / Use Cases
        ↓
2. Identify Core Entities
        ↓
3. Define Responsibilities
        ↓
4. Relationships + Interfaces
        ↓
5. Class Diagram
        ↓
6. Walk Through Core Flows
        ↓
7. Implement Critical Code
        ↓
8. Edge Cases + Extensibility + Wrap-Up
```

| Phase | Time | What you do |
|---|---:|---|
| 1. Requirements / Use Cases | 4–5 min | Define what the system must do, then scope it explicitly |
| 2. Core Entities | 3–5 min | Discover the important objects/classes (usually the nouns) |
| 3. Responsibilities | 4–5 min | Decide what each class owns and does |
| 4. Relationships + Interfaces | 5–7 min | is-a / has-a / uses-a, then interfaces at the points that change |
| 5. Class Diagram | 5–7 min | Assemble the object model: classes, interfaces, enums, relationships |
| 6. Core Flows | 5–7 min | Walk an interaction through the objects end to end |
| 7. Critical Code | 10–15 min | Implement only the classes/methods that carry design decisions |
| 8. Edge Cases + Extensibility + Wrap-Up | 3–5 min | Attack your own design, then say how it absorbs change |

## The four questions to keep asking

Throughout the whole interview, keep asking:

```text
1. Who owns this state?
2. Who owns this behavior?
3. Who should this class depend on?
4. What happens when this requirement changes?
```

## Two habits that make this work

- **Phase 3 is where most candidates fail.** Resist one giant `ParkingLot` that parks, prices, pays, and notifies. Give each behavior to the class that owns the state it needs.
- **Patterns are discovered, not announced.** Do not open with "we should use Strategy." Name the problem first — *"different vehicle types price differently, so fee calculation must be replaceable"* — and the interface (`FeeStrategy`) falls out. The pattern is a consequence of the requirement.

## Designs

| Design | Interview focus |
|---|---|
| [Parking Lot](parking-lot.md) | Allocation, tickets, pricing, capacity, payment |
| [Elevator](elevator.md) | Scheduling policy, car state, invariants, concurrency |
| [Vending Machine](vending-machine.md) | State machine, inventory, payment, refund |
| [Splitwise](splitwise.md) | Expenses, split strategies, balances, settlement |
| [BookMyShow](bookmyshow.md) | Seats, holds, bookings, concurrent booking |
| [ATM](atm.md) | Authentication, ATM states, cash dispensing, rollback |
| [Car Rental](car-rental.md) | Reservations, fleet availability, returns |
| [Logger](logger.md) | Levels, sinks, configuration, chain of responsibility |
| [Notification System](notification-system.md) | Channels, preferences, delivery strategies |
| [Cache](cache.md) | Eviction policies, storage, concurrency |

More problems to work through with the same path: Chess, Library Management, Hotel Booking, Splitwise groups, and a Text Editor.
