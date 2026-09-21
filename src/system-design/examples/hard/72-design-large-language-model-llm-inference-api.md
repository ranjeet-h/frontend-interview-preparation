# 72. Design Large Language Model (LLM) Inference API

[← Hard examples](index.md)

**Why interviewers ask** — LLMs are expensive and slow; they want batching, caching, quantization, and cost-per-token reasoning.

**Core insight** — Throughput and latency pull in opposite directions; batch requests, cache prompt prefixes, and quantize models to fit more tokens per GPU second.

**Architecture**

```txt
Client → API gateway (rate limit, auth) → request queue
       → inference workers (GPU) with continuous batching
       → KV cache per active sequence
Optional: prompt embedding cache, speculative decoding, model parallel across GPUs
```

- **Batching** — Dynamic batching merges concurrent requests; increases GPU utilization at cost of tail latency.
- **Caching** — Cache prompt prefix KV states for repeated system prompts; semantic cache for near-duplicate queries.
- **Quantization** — INT8/FP8 reduces memory, increases tokens/sec; quality tradeoff per use case.
- **Scaling** — Model parallel splits layers across GPUs; data parallel for independent prompts.

**Key decisions** — Streaming responses for UX; max context window enforcement; separate tiers for latency-sensitive vs batch workloads.

**Scale & failure** — Queue backpressure with 429 when saturated; preemption policy for long contexts; multi-region replicas for availability.

**Memory hook** — Batch for throughput, cache prefixes, quantize for capacity — tokens per dollar is the metric.
