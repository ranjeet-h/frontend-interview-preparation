# 4. Design Parking Garage

[← Easy examples](index.md)

**Why interviewers ask:** This is a constrained state machine, not a web-scale fanout problem. Interviewers test transactional spot assignment, entry/exit race conditions, multi-vehicle-type pricing, and keeping physical gates in sync with digital inventory.

**Core insight:** One authoritative spot inventory updated atomically on entry/exit; gates and displays are clients of that inventory; billing derives from timestamps and vehicle class.

**Architecture**

```txt
Entry gate → Gate controller → API (allocate spot, open gate)
                                    ↓
                              Spot DB (status per bay)
                                    ↓
Exit gate → Gate controller → API (release spot, compute fee)
                                    ↓
                              Payment processor
         Display boards ← read replica / cache of available counts
         Admin dashboard ← reports, manual overrides, pricing rules
```

- **Spot database:** Each bay row tracks status (free/occupied), vehicle type allowed, level, and current session id — updates must be transactional.
- **Gate controllers:** Local hardware issues entry/exit events; API assigns nearest free compatible spot and returns gate command; idempotent event ids prevent double entry.
- **Availability display:** Reads aggregated free counts per level/type from cache or read replica — stale by a few seconds is acceptable for signage.
- **Payment processor:** On exit, fee = duration × rate(vehicle_class) + rules; integrate card/UPI; session links entry timestamp to exit.
- **Admin dashboard:** Override stuck sessions, fix misreads, configure pricing tiers and capacity per vehicle type.

**Key decisions**

- **Central DB vs per-level counters:** Per-bay rows in one DB with row-level locks — simpler than distributed counters and avoids double-booking a bay.
- **Optimistic vs pessimistic allocation:** Pessimistic (lock bay on entry request) — correct for physical scarcity; optimistic fails when two cars race for the last spot.
- **Real-time display accuracy:** Eventual consistency on display counts is fine; spot assignment itself must be strongly consistent.

**Scale & failure:** Entry peak congestion or DB lock contention on hot rows breaks first. Mitigation: partition bays by level/gate, short-lived locks, and queue at gate UI when allocation is slow.

**Memory hook:** Parking is hotel keys for cars — one ledger of which bay is occupied, gates only open when the ledger says yes, checkout computes the bill.
