/* Rate Limiter — HLD load & scale visualizer config. */
(function () {
  "use strict";

  var LIMIT = 4000; // allowed rps policy (the configured quota)
  var LIMITER_CAP = 20000; // checks/s per limiter node
  var REDIS_CAP = 50000; // counter ops/s per Redis node
  var BACKEND_CAP = 5000; // protected backend rps
  var TARGET = 0.7;

  function name(k) {
    return { limiter: "Rate-limiter tier", redis: "Shared counter (Redis)", backend: "Protected backend" }[k] || "Component";
  }

  function compute(state, rps, h) {
    var fmt = h.fmt, pct = h.pct;
    var allowed = Math.min(rps, LIMIT);
    var rejected = rps - allowed;

    var limiterUtil = rps / (state.limiter * LIMITER_CAP);
    var redisUtil = rps / (state.redis * REDIS_CAP);
    var backendUtil = allowed / BACKEND_CAP;

    var required = {
      limiter: Math.max(1, Math.ceil(rps / (LIMITER_CAP * TARGET))),
      redis: Math.max(1, Math.ceil(rps / (REDIS_CAP * TARGET))),
    };

    var utils = { limiter: limiterUtil, redis: redisUtil, backend: backendUtil };
    var bottleneck = null, worst = 0;
    ["limiter", "redis"].forEach(function (k) { if (utils[k] >= TARGET && utils[k] > worst) { worst = utils[k]; bottleneck = k; } });
    var overall = Math.max(limiterUtil, redisUtil);

    var narration;
    if (bottleneck && overall >= 1) narration = { cls: "danger", text: "🔴 <strong>" + name(bottleneck) + "</strong> is saturated at " + pct(overall) + " — checks are failing or timing out. Scale it out." };
    else if (bottleneck) narration = { cls: "warn", text: "🟠 <strong>" + name(bottleneck) + "</strong> is running hot at " + pct(overall) + ". Headroom is shrinking." };
    else narration = { cls: "ok", text: "🟢 " + fmt(rps) + " rps in → " + fmt(allowed) + " allowed, " + fmt(rejected) + " rejected (429). Limiter " + pct(limiterUtil) + ", Redis " + pct(redisUtil) + "." };

    return {
      load: { clients: rps, limiter: rps, redis: rps, backend: allowed, rejected: rejected },
      edgeFlow: { "clients-limiter": rps, "limiter-redis": rps, "limiter-backend": allowed, "limiter-rejected": rejected },
      required: required,
      bottleneck: bottleneck,
      worst: overall,
      nodeSub: {
        clients: fmt(rps) + " rps",
        limiter: "×" + state.limiter + " · " + pct(limiterUtil),
        redis: "×" + state.redis + " · " + pct(redisUtil),
        backend: fmt(allowed) + " rps · " + pct(backendUtil),
        rejected: fmt(rejected) + " (429)",
      },
      metrics: [
        { key: "in", label: "Incoming", value: fmt(rps) + " rps", level: "ok" },
        { key: "allow", label: "Allowed", value: fmt(allowed) + " rps", level: "ok" },
        { key: "rej", label: "Rejected (429)", value: fmt(rejected) + " rps", level: rejected > 0 ? "warn" : "ok" },
        { key: "lim", label: "Limiter util", value: pct(limiterUtil), level: limiterUtil >= 1 ? "danger" : limiterUtil >= TARGET ? "warn" : "ok" },
        { key: "red", label: "Redis util", value: pct(redisUtil), level: redisUtil >= 1 ? "danger" : redisUtil >= TARGET ? "warn" : "ok" },
        { key: "be", label: "Backend util", value: pct(backendUtil), level: backendUtil >= 1 ? "danger" : backendUtil >= TARGET ? "warn" : "ok" },
      ],
      narration: narration,
    };
  }

  function init() {
    document.querySelectorAll(".rate-limiter-hld-visualizer").forEach(function (el) {
      if (el.dataset.initialized === "true" || !window.SDHLDSim) return;
      el.dataset.initialized = "true";
      window.SDHLDSim.attach(el, {
        traffic: {
          label: "Incoming", default: 2,
          options: [
            { label: "100 rps", value: 100 }, { label: "1,000 rps", value: 1000 }, { label: "4,000 rps", value: 4000 },
            { label: "10,000 rps", value: 10000 }, { label: "50,000 rps", value: 50000 }, { label: "200,000 rps", value: 200000 },
          ],
        },
        target: TARGET,
        aria: "Rate limiter architecture under load",
        note: "Token-bucket checks run on stateless limiter nodes; the shared counter lives in Redis, so the consumption decision is atomic. Requests over the " + LIMIT + " rps policy are rejected with 429; allowed traffic reaches the protected backend.",
        nodes: [
          { id: "clients", label: "Clients", icon: "👥", kind: "client", x: 80, y: 280, capacity: null, min: 1 },
          { id: "limiter", label: "Rate limiter", icon: "🚦", kind: "service", x: 330, y: 280, capacity: LIMITER_CAP, scaleLabel: "limiter node", min: 1, count: 2,
            fail: "every request is checked, so the limiter tier sees full traffic.", why: "Limiter nodes are stateless; more nodes split the checks evenly." },
          { id: "redis", label: "Counter (Redis)", icon: "⚡", kind: "cache", x: 330, y: 80, capacity: REDIS_CAP, scaleLabel: "Redis node", min: 1, count: 1,
            fail: "each check reads/updates the shared counter, so Redis sees full traffic.", why: "Shard counters across more Redis nodes to spread the atomic ops." },
          { id: "backend", label: "Backend", icon: "🗄️", kind: "service", x: 660, y: 280, capacity: BACKEND_CAP, min: 1, count: 1,
            fail: "the backend is protected by the limit and should never saturate.", why: "The limiter caps traffic before it reaches the backend." },
          { id: "rejected", label: "429", icon: "⛔", kind: "external", x: 660, y: 80, capacity: null, min: 1 },
        ],
        edges: [
          { from: "clients", to: "limiter", kind: "read" },
          { from: "limiter", to: "redis", kind: "cache" },
          { from: "limiter", to: "backend", kind: "read" },
          { from: "limiter", to: "rejected", kind: "write" },
        ],
        compute: compute,
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
