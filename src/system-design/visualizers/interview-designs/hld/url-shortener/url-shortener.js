/* URL Shortener — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var RPS_PER_USER = 0.02, READ_SHARE = 0.99;
  var API_CAP = 2000, CACHE_CAP = 50000, BASE_HIT = 0.95, PRIMARY_CAP = 4000, REPLICA_CAP = 8000, WORKER_CAP = 10000;
  var TARGET = 0.7;

  function name(k) {
    return { api: "API tier", redis: "Redis cache", replicas: "Read replicas", workers: "Analytics workers", primary: "Primary DB", queue: "Analytics queue" }[k] || "Component";
  }

  function compute(state, users, h) {
    var fmt = h.fmt, pct = h.pct;
    var rps = Math.max(1, Math.round(users * RPS_PER_USER));
    var reads = rps * READ_SHARE, writes = rps * (1 - READ_SHARE);

    var apiUtil = rps / (state.api * API_CAP);
    var cacheCap = state.redis * CACHE_CAP;
    var cacheUtil = reads / cacheCap;
    var hit = reads <= cacheCap ? BASE_HIT : Math.max(0.1, BASE_HIT * (cacheCap / reads));
    var cachedReads = reads * hit, miss = reads - cachedReads;
    var onRep = Math.min(miss, state.replicas * REPLICA_CAP);
    var onPri = miss - onRep;

    var primaryLoad = writes + onPri;
    var shards = Math.max(1, state.primary || 1);
    var primaryUtil = primaryLoad / shards / PRIMARY_CAP;
    var replicaUtil = state.replicas ? onRep / (state.replicas * REPLICA_CAP) : null;
    var ingest = reads, workerUtil = ingest / (state.workers * WORKER_CAP);

    var apiLat = 12 * (1 + Math.max(0, apiUtil - TARGET) * 4);
    var cacheLat = 2 * (1 + Math.max(0, cacheUtil - TARGET) * 3);
    var dbLat = 6 * (1 + Math.max(0, primaryUtil - TARGET) * 6);
    var p99 = 8 + apiLat + cacheLat + dbLat;
    var over = Math.max(0, apiUtil - 1) + Math.max(0, primaryUtil - 1) + Math.max(0, cacheUtil - 1) * 0.6 + Math.max(0, workerUtil - 1) * 0.3;
    var err = Math.min(100, over * 30);
    p99 *= 1 + (err / 100) * 1.6;

    var utils = { api: apiUtil, redis: cacheUtil, replicas: replicaUtil, workers: workerUtil, primary: primaryUtil };
    var required = {
      api: Math.max(1, Math.ceil(rps / (API_CAP * TARGET))),
      redis: Math.max(1, Math.ceil(reads / (CACHE_CAP * TARGET))),
      replicas: Math.max(0, Math.ceil((reads * (1 - BASE_HIT)) / (REPLICA_CAP * TARGET))),
      workers: Math.max(1, Math.ceil(ingest / (WORKER_CAP * TARGET))),
      primary: Math.max(1, Math.ceil(primaryLoad / (PRIMARY_CAP * TARGET))),
    };

    // Fix priority (mirrors easy #1/#2): replicas only absorb cache-miss READS.
    // If the primary is hot from WRITES, replicas can never fix it — it needs sharding.
    var at = function (k) { return utils[k] != null && utils[k] >= TARGET; };
    var readDriven = onPri > 1;
    var bottleneck = null;
    if (readDriven && at("primary") && at("redis")) bottleneck = "redis";
    else {
      var best = 0;
      ["api", "redis", "replicas", "workers"].forEach(function (k) { if (at(k) && utils[k] > best) { best = utils[k]; bottleneck = k; } });
      if (!bottleneck) {
        if (at("primary") && readDriven && state.replicas < required.replicas) bottleneck = "replicas";
        else if (at("primary")) bottleneck = "primary"; // shard it: writes divide by N
      }
    }
    var worst = 0;
    Object.keys(utils).forEach(function (k) { if (utils[k] != null && utils[k] > worst) worst = utils[k]; });

    var narration;
    if (err >= 1 || worst >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck || "primary") + "</strong> is saturated — requests are failing (" + err.toFixed(0) + "% errors, p99 " + Math.round(p99) + " ms)." };
    else if (worst >= TARGET) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck || "primary") + "</strong> is running hot at " + pct(worst) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 Healthy. " + fmt(rps) + " rps rides the cache (" + Math.round(hit * 100) + "% hit); the primary DB only sees " + fmt(primaryLoad) + " qps." };

    return {
      load: { clients: rps, api: rps, redis: reads, replicas: onRep, queue: ingest, workers: ingest, analytics: ingest, idgen: writes, primary: primaryLoad },
      edgeFlow: { "clients-api": rps, "api-redis": cachedReads, "api-idgen": writes, "idgen-primary": writes, "api-primary": onPri, "api-replicas": onRep, "api-q": ingest, "q-w": ingest, "w-a": ingest },
      required: required,
      bottleneck: bottleneck,
      worst: worst,
      nodeSub: {
        clients: fmt(rps) + " rps",
        api: "×" + state.api + " · " + pct(apiUtil),
        redis: "×" + state.redis + " · " + pct(cacheUtil),
        replicas: "×" + state.replicas + " · " + pct(replicaUtil),
        queue: fmt(ingest) + " msg/s",
        workers: "×" + state.workers + " · " + pct(workerUtil),
        analytics: "click store",
        idgen: "counter → Base62",
        primary: "×" + shards + " shards · " + fmt(primaryLoad) + " qps · " + pct(primaryUtil),
      },
      metrics: [
        { key: "rps", label: "Peak RPS", value: fmt(rps), level: apiUtil >= 1 ? "danger" : apiUtil >= TARGET ? "warn" : "ok" },
        { key: "p99", label: "p99 latency", value: Math.round(p99) + " ms", level: err >= 1 ? "danger" : p99 > 250 ? "warn" : "ok" },
        { key: "err", label: "Errors", value: err.toFixed(0) + "%", level: err >= 5 ? "danger" : err >= 0.5 ? "warn" : "ok" },
        { key: "hit", label: "Cache hit", value: Math.round(hit * 100) + "%", level: cacheUtil >= 1 ? "danger" : cacheUtil >= TARGET ? "warn" : "ok" },
        { key: "db", label: "Primary qps", value: fmt(primaryLoad) + " qps", level: primaryUtil >= 1 ? "danger" : primaryUtil >= TARGET ? "warn" : "ok" },
        { key: "q", label: "Click msg/s", value: fmt(ingest) + " /s", level: workerUtil >= 1 ? "danger" : workerUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".url-shortener-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Traffic", default: 0,
          options: [
            { label: "1,000 users", value: 1000 }, { label: "10,000 users", value: 10000 }, { label: "100,000 users", value: 100000 },
            { label: "1M users", value: 1000000 }, { label: "10M users", value: 10000000 }, { label: "100M users", value: 100000000 },
          ],
        },
        target: TARGET,
        aria: "URL shortener architecture under load",
        note: "Traffic assumes peak RPS ≈ DAU × 2% (100:1 read:write). Every redirect emits one click event. Read replicas absorb cache-miss reads; the primary DB shards when writes alone exceed one node.",
        nodes: [
          { id: "clients", label: "Clients", icon: "👥", kind: "client", x: 80, y: 340, capacity: null, min: 1 },
          { id: "api", label: "API", icon: "⚙️", kind: "service", x: 280, y: 340, capacity: API_CAP, scaleLabel: "API server", min: 1, count: 2,
            fail: "the stateless API is the front door and takes every request.", why: "API servers are stateless, so more servers split the same requests evenly." },
          { id: "redis", label: "Redis", icon: "⚡", kind: "cache", x: 560, y: 130, capacity: CACHE_CAP, scaleLabel: "Redis node", min: 1, count: 1,
            fail: "the cache cannot serve all reads, so misses flood the DB.", why: "More Redis nodes raise the hit rate and keep misses off the database." },
          { id: "replicas", label: "Read replicas", icon: "📚", kind: "db", x: 850, y: 210, capacity: REPLICA_CAP, scaleLabel: "read replica", min: 0, count: 0, hideWhenZero: true,
            fail: "cache misses are landing on the primary DB.", why: "Read replicas absorb cache-miss reads, leaving the primary to handle writes." },
          { id: "queue", label: "Queue", icon: "📥", kind: "queue", x: 560, y: 340, capacity: null, min: 1 },
          { id: "workers", label: "Workers", icon: "🛠️", kind: "worker", x: 810, y: 340, capacity: WORKER_CAP, scaleLabel: "analytics worker", min: 1, count: 1,
            fail: "click events arrive faster than workers can drain them.", why: "More workers drain the click-event queue faster." },
          { id: "analytics", label: "Analytics", icon: "📊", kind: "service", x: 1010, y: 340, capacity: null, min: 1 },
          { id: "idgen", label: "ID gen", icon: "🔑", kind: "service", x: 560, y: 550, capacity: null, min: 1 },
          { id: "primary", label: "Primary DB", icon: "🗄️", kind: "db", x: 850, y: 550, capacity: PRIMARY_CAP, scaleLabel: "primary shard", min: 1, count: 1,
            fail: "writes alone exceed what one primary can sustain.", why: "Sharding by hash(code) spreads writes across N primaries, so each handles 1/N." },
        ],
        edges: [
          { from: "clients", to: "api", kind: "read" },
          { from: "api", to: "redis", kind: "cache" },
          { from: "api", to: "idgen", kind: "write" },
          { from: "idgen", to: "primary", kind: "write" },
          { from: "api", to: "primary", kind: "write" },
          { from: "api", to: "replicas", kind: "read" },
          { from: "api", to: "queue", kind: "queue" },
          { from: "queue", to: "workers", kind: "queue" },
          { from: "workers", to: "analytics", kind: "queue" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
