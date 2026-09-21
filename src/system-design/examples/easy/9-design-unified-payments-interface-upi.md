# 9. Design Unified Payments Interface (UPI)

[← Easy examples](index.md)

**Why interviewers ask:** Money movement demands correctness over speed. UPI-style designs test idempotent transfers, ACID ledger, real-time settlement paths, fraud checks, and audit trails — duplicate requests must never double-pay.

**Core insight:** Every payment is a ledger transaction with idempotency keys; state machine from initiated → debited → credited → settled; reconciliation catches drift between banks and your records.

**Architecture**

```txt
User app → Payment API (idempotency-key header)
              ↓
         Account service (balance checks, VPA resolution)
              ↓
         Transaction DB (ACID, double-entry ledger rows)
              ↓
         Payment gateway / NPCI switch
              ↓
         Settlement service (batch reconcile with banks)
              ↓ parallel
         Fraud detection + notification service
```

- **Account service:** Maps UPI ID to bank account; validates payer balance and limits before debit attempt.
- **Transaction database:** ACID writes — debit and credit rows in one transaction; unique constraint on idempotency key per client request.
- **Payment gateway:** Routes to NPCI/bank network; handles async callbacks for final status — your API must reconcile pending states.
- **Settlement service:** Nightly or intraday matching of internal ledger vs bank statements; flags mismatches for ops.
- **Fraud detection:** Velocity rules, device fingerprint, anomaly on amount/geo — can block before gateway call.

**Key decisions**

- **Sync API vs async confirmation:** User sees "pending" quickly; final status from webhook — never mark success before bank ack.
- **Idempotency keys mandatory:** Retries are normal on mobile networks — same key returns same result, never duplicate debit.
- **Double-entry ledger:** Every transfer is two rows (debit + credit) — sum invariant catches corruption early.

**Scale & failure:** Gateway timeouts leaving transactions stuck in `PENDING` break user trust first. Mitigation: timeout reconciliation job, explicit status polling, and customer-visible pending state with auto-resolve.

**Deep link:** [Design a payment system](../../backend-designs/design-a-payment-system.md)

**Memory hook:** Payments are ledger math with receipts — idempotency key is the receipt number, never charge twice for the same number, reconcile when the bank disagrees.
