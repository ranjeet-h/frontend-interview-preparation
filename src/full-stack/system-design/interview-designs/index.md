# HLD & LLD Interview Designs

Interview system design has two complementary levels of thinking:

- **High-level design (HLD)** starts with the system: requirements, scale, data flow, components, reliability, and the trade-offs between them.
- **Low-level design (LLD)** starts with the object model: entities, responsibilities, interfaces, workflows, and the boundaries that keep a design extensible.

Study both. HLD helps you explain how a product works at scale; LLD helps you show how its core behavior can be modeled clearly and changed safely.

## Choose a track

| Track | Focus | Start here |
|---|---|---|
| HLD | Distributed systems, scale, data flow, and operational trade-offs | [HLD Interview Designs](hld/index.md) |
| LLD | Object design, class responsibilities, workflows, and extensibility | [LLD Interview Designs](lld/index.md) |

## Recommended interview sequence

1. Clarify the problem and state what is in and out of scope.
2. For HLD, estimate scale before drawing components; for LLD, identify entities before drawing classes.
3. Explain the main flow first, then the important failure, concurrency, and trade-off cases.
4. End by summarizing the design invariant the interviewer should remember.

## Existing tracks for optional context

This focused section complements, but does not replace, the preserved tracks:

- [100-question System Design guide](../index.md), including foundations, problem banks, specialist areas, and preparation strategy.
- [Backend System Design Pages](../../backend/system-design/index.md) for deeper whiteboard-style walkthroughs of selected backend systems.
