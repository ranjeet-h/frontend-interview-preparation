# 80. Design Distributed Consensus for Blockchain

[← Hard examples](index.md)

**Why interviewers ask** — Byzantine fault tolerance, fork choice, and the energy/latency tradeoffs between PoW, PoS, and BFT — consensus as a product decision.

**Core insight** — Consensus defines who gets to append the next block and what "final" means; mechanism choice trades decentralization, throughput, and energy.

**Architecture**

```txt
Transactions → mempool → block proposer (miner/validator)
                      → consensus round (PoW puzzle / PoS vote / BFT commit)
                      → append to chain → propagate to peers
Nodes → full (full history) | light (headers + Merkle proofs)
```

- **Proof of Work** — Miners compete on hash puzzle; highest chain wins; energy-intensive, proven decentralization.
- **Proof of Stake** — Validators stake collateral; slashing for dishonesty; faster finality, lower energy.
- **BFT (PBFT/Tendermint)** — Permissioned validators; 2f+1 honest nodes; low latency, limited decentralization.
- **Fork choice** — Longest chain (PoW) vs finalized checkpoints (PoS Casper FFG).

**Key decisions** — Permissionless vs permissioned; finality time vs throughput; on-chain vs off-chain (L2) scaling.

**Scale & failure** — 51% attack on PoW; nothing-at-stake mitigated by slashing in PoS; network partition → chain halt or fork until reunification.

**Deep link** — [CAP theorem](../../foundations/cap-theorem.md) · [Strong vs eventual consistency](../../foundations/strong-vs-eventual-consistency.md)

**Memory hook** — PoW burns energy for trust, PoS stakes money, BFT votes fast in small groups.
