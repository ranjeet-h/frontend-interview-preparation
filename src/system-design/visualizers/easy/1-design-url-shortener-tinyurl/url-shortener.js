/* URL Shortener (Easy #1) load & scale visualizer.
   Prefix: usv-. Plain browser JS, no dependencies. Scopes everything to
   .url-shortener-visualizer containers and never touches page code. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  // ---- traffic + capacity assumptions (shown to the learner) -----------------
  var RPS_PER_USER = 0.02; // 2% of DAU active per second
  var READ_SHARE = 0.99; // 100:1 read:write
  var API_CAP = 2000; // redirects+creates per second per API server
  var CACHE_CAP = 50000; // ops/s per Redis node
  var BASE_HIT = 0.95; // cache hit rate when Redis is not overloaded
  var PRIMARY_CAP = 4000; // qps the primary DB sustains
  var REPLICA_CAP = 8000; // read qps per read replica
  var WORKER_CAP = 10000; // click events/s per analytics worker
  var TARGET = 0.7; // keep every component under 70% utilization

  var USERS = [
    { label: "1,000 users", value: 1000 },
    { label: "10,000 users", value: 10000 },
    { label: "100,000 users", value: 100000 },
    { label: "1M users", value: 1000000 },
    { label: "10M users", value: 10000000 },
    { label: "100M users", value: 100000000 },
  ];

  var DEFAULTS = { users: 0, api: 2, redis: 1, replicas: 0, workers: 1 };

  var NODES = {
    clients: { x: 80, y: 340, label: "👥 Clients" },
    api: { x: 280, y: 340, label: "⚙️ API" },
    redis: { x: 560, y: 130, label: "⚡ Redis" },
    replicas: { x: 850, y: 210, label: "📚 Replicas" },
    queue: { x: 560, y: 340, label: "📥 Queue" },
    workers: { x: 810, y: 340, label: "🛠️ Workers" },
    analytics: { x: 1010, y: 340, label: "📊 Analytics" },
    idgen: { x: 560, y: 550, label: "🔑 ID gen" },
    primary: { x: 850, y: 550, label: "🗄️ Primary DB" },
  };
  var W = 142;
  var H = 60;

  var EDGES = [
    { id: "c-api", from: "clients", to: "api", kind: "read" },
    { id: "api-redis", from: "api", to: "redis", kind: "cache" },
    { id: "api-replicas", from: "api", to: "replicas", kind: "read", needsReplicas: true },
    { id: "api-primary", from: "api", to: "primary", kind: "write", hidesWhenReplicas: true },
    { id: "api-idgen", from: "api", to: "idgen", kind: "write" },
    { id: "idgen-primary", from: "idgen", to: "primary", kind: "write" },
    { id: "api-q", from: "api", to: "queue", kind: "queue" },
    { id: "q-w", from: "queue", to: "workers", kind: "queue" },
    { id: "w-a", from: "workers", to: "analytics", kind: "queue" },
    { id: "primary-replicas", from: "primary", to: "replicas", kind: "read", needsReplicas: true, dashed: true, control: { x: 995, y: 380 } },
  ];

  var DOT_COLOR = { read: "#2563eb", cache: "#0891b2", write: "#d97706", queue: "#7c3aed" };

  var TRACES = {
    redirect: {
      label: "Redirect",
      steps: [
        { edge: "c-api", nodes: ["clients", "api"], text: "User opens a short link → GET /{code} hits the API." },
        { edge: "api-redis", nodes: ["api", "redis"], text: "The API looks the code up in Redis — the hot path (≈95% hit)." },
        { nodes: ["redis"], text: "Redis returns the long URL in a few milliseconds." },
        { edge: "c-api", nodes: ["clients", "api"], text: "The API replies 301/302 and the browser follows the redirect." },
        { edge: "api-primary", altEdge: "api-replicas", nodes: ["api", "primary"], text: "On the ~5% cache miss, the DB is read to resolve the code." },
      ],
    },
    create: {
      label: "Create",
      steps: [
        { edge: "c-api", nodes: ["clients", "api"], text: "User submits a long URL → POST /shorten." },
        { edge: "api-idgen", nodes: ["api", "idgen"], text: "The API asks the ID generator for a unique code (counter + Base62)." },
        { edge: "idgen-primary", nodes: ["idgen", "primary"], text: "The code → URL mapping is written durably to the primary DB." },
        { edge: "api-redis", nodes: ["api", "redis"], text: "The new mapping is cached in Redis for fast future redirects." },
      ],
    },
    click: {
      label: "Click",
      steps: [
        { edge: "c-api", nodes: ["clients", "api"], text: "Every redirect also emits one click event." },
        { edge: "api-q", nodes: ["api", "queue"], text: "The event goes to the queue — off the redirect path, so it never adds latency." },
        { edge: "q-w", nodes: ["queue", "workers"], text: "Analytics workers drain the queue." },
        { edge: "w-a", nodes: ["workers", "analytics"], text: "Counts are batched into the analytics store." },
      ],
    },
  };

  var UNAME = {
    api: "API tier",
    redis: "Redis cache",
    primary: "Primary DB",
    replicas: "Read replicas",
    workers: "Analytics workers",
    queue: "Analytics queue",
  };
  var UNIT = { api: "API server", redis: "Redis node", replicas: "read replica", workers: "analytics worker" };
  var WHY = {
    api: "API servers are stateless, so N more servers split the same requests evenly.",
    redis: "Redis serves hot short codes; more nodes raise the hit rate and keep misses off the DB.",
    replicas: "Read replicas absorb cache misses, so the primary DB is left to handle writes.",
    workers: "Workers drain the click-event queue; more workers clear the backlog faster.",
  };

  // ---- helpers ---------------------------------------------------------------
  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }
  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }
  function pct(u) {
    if (u == null) return "–";
    if (!isFinite(u)) return "∞";
    return Math.round(u * 100) + "%";
  }
  function level(u) {
    if (u == null) return "ok";
    if (u >= 1) return "danger";
    if (u >= TARGET) return "warn";
    return "ok";
  }
  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  // ---- the model -------------------------------------------------------------
  function compute(state) {
    var s = Object.assign({}, state);
    var users = USERS[s.users].value;
    var rps = Math.max(1, Math.round(users * RPS_PER_USER));
    var reads = rps * READ_SHARE;
    var writes = rps * (1 - READ_SHARE);

    var apiCap = s.api * API_CAP;
    var apiUtil = apiCap ? rps / apiCap : Infinity;

    var cacheCap = s.redis * CACHE_CAP;
    var cacheUtil = cacheCap ? reads / cacheCap : Infinity;
    var hit = reads <= cacheCap ? BASE_HIT : clamp(BASE_HIT * (cacheCap / reads), 0.1, BASE_HIT);

    var cachedReads = reads * hit;
    var missReads = reads - cachedReads;

    var replicaCap = s.replicas * REPLICA_CAP;
    var readsOnReplicas = Math.min(missReads, replicaCap);
    var readsOnPrimary = missReads - readsOnReplicas;

    var primaryLoad = writes + readsOnPrimary;
    var primaryUtil = primaryLoad / PRIMARY_CAP;
    var replicaUtil = s.replicas ? readsOnReplicas / replicaCap : null;

    var ingest = reads; // every redirect emits a click event
    var workerCap = s.workers * WORKER_CAP;
    var workerUtil = workerCap ? ingest / workerCap : Infinity;
    var queueUtil = workerUtil;

    var apiLat = 12 * (1 + Math.max(0, apiUtil - TARGET) * 4);
    var cacheLat = 2 * (1 + Math.max(0, cacheUtil - TARGET) * 3);
    var dbLat = 6 * (1 + Math.max(0, primaryUtil - TARGET) * 6);
    var queueLat = workerUtil > 0.8 ? (workerUtil - 0.8) * 180 : 0;
    var p99 = 8 + apiLat + cacheLat + dbLat + queueLat;

    var over =
      Math.max(0, apiUtil - 1) +
      Math.max(0, primaryUtil - 1) +
      Math.max(0, cacheUtil - 1) * 0.6 +
      Math.max(0, workerUtil - 1) * 0.3;
    var errorRate = clamp(over * 30, 0, 100);
    p99 *= 1 + (errorRate / 100) * 1.6;

    var utils = {
      clients: null,
      api: apiUtil,
      redis: cacheUtil,
      replicas: replicaUtil,
      queue: queueUtil,
      workers: workerUtil,
      analytics: null,
      idgen: null,
      primary: primaryUtil,
    };

    var required = {
      api: Math.max(1, Math.ceil(rps / (API_CAP * TARGET))),
      redis: Math.max(1, Math.ceil(reads / (CACHE_CAP * TARGET))),
      replicas: Math.max(0, Math.ceil((reads * (1 - BASE_HIT)) / (REPLICA_CAP * TARGET))),
      workers: Math.max(1, Math.ceil(ingest / (WORKER_CAP * TARGET))),
    };

    var bottleneck = null;
    var worst = 0;
    ["api", "redis", "primary", "replicas", "workers"].forEach(function (k) {
      var u = utils[k];
      if (u != null && u > worst) {
        worst = u;
        bottleneck = k;
      }
    });

    return {
      s: s,
      users: users,
      rps: rps,
      reads: reads,
      writes: writes,
      cachedReads: cachedReads,
      missReads: missReads,
      readsOnPrimary: readsOnPrimary,
      readsOnReplicas: readsOnReplicas,
      hit: hit,
      apiUtil: apiUtil,
      cacheUtil: cacheUtil,
      primaryLoad: primaryLoad,
      primaryUtil: primaryUtil,
      replicaUtil: replicaUtil,
      workerUtil: workerUtil,
      queueUtil: queueUtil,
      ingest: ingest,
      p99: p99,
      errorRate: errorRate,
      utils: utils,
      required: required,
      bottleneck: bottleneck,
      worst: worst,
    };
  }

  function pickFix(m) {
    var u = m.utils;
    var at = function (k) {
      return u[k] != null && u[k] >= TARGET;
    };
    if (at("primary") && at("redis")) return "redis";
    var best = null;
    var bestU = 0;
    ["api", "redis", "replicas", "workers"].forEach(function (k) {
      if (at(k) && u[k] > bestU) {
        bestU = u[k];
        best = k;
      }
    });
    if (best) return best;
    if (at("primary")) return "replicas";
    return null;
  }

  // ---- geometry --------------------------------------------------------------
  function edgeGeo(e) {
    var a = NODES[e.from];
    var b = NODES[e.to];
    var p0 = { x: a.x, y: a.y };
    var p2 = { x: b.x, y: b.y };
    var c = e.control ? { x: e.control.x, y: e.control.y } : { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    return { p0: p0, c: c, p2: p2 };
  }
  function qpoint(g, t) {
    var mt = 1 - t;
    return {
      x: mt * mt * g.p0.x + 2 * mt * t * g.c.x + t * t * g.p2.x,
      y: mt * mt * g.p0.y + 2 * mt * t * g.c.y + t * t * g.p2.y,
    };
  }
  function pathD(g) {
    return "M " + g.p0.x + " " + g.p0.y + " Q " + g.c.x + " " + g.c.y + " " + g.p2.x + " " + g.p2.y;
  }

  function nodeTemplate(uid, key, n) {
    var hasBar = key !== "clients" && key !== "analytics" && key !== "idgen";
    return (
      '<g class="usv-node" id="' +
      uid +
      "-node-" +
      key +
      '" data-node="' +
      key +
      '" transform="translate(' +
      n.x +
      "," +
      n.y +
      ')">' +
      '<rect class="usv-box" x="' +
      -W / 2 +
      '" y="' +
      -H / 2 +
      '" width="' +
      W +
      '" height="' +
      H +
      '" rx="12"></rect>' +
      '<text class="usv-node-title" x="0" y="-11" text-anchor="middle">' +
      n.label +
      "</text>" +
      '<text class="usv-node-sub" x="0" y="8" text-anchor="middle" data-sub></text>' +
      (hasBar
        ? '<rect class="usv-bar-bg" x="-47" y="19" width="94" height="6" rx="3"></rect>' +
          '<rect class="usv-bar-fill" x="-47" y="19" width="0" height="6" rx="3" data-bar></rect>'
        : "") +
      '<text class="usv-plus" x="0" y="-38" text-anchor="middle" data-plus>+1</text>' +
      "</g>"
    );
  }

  function metric(label, key) {
    return (
      '<div class="usv-metric" data-metric="' +
      key +
      '"><span class="usv-metric-label">' +
      label +
      '</span><span class="usv-metric-value">–</span></div>'
    );
  }

  function build(container) {
    var uid = "usv" + build.count;
    build.count += 1;
    container.classList.add("usv"); // activates the --usv-* theme variables

    var usersOpts = USERS.map(function (u, i) {
      return '<option value="' + i + '"' + (i === DEFAULTS.users ? " selected" : "") + ">" + u.label + "</option>";
    }).join("");

    var edgesSvg = EDGES.map(function (e) {
      var g = edgeGeo(e);
      return (
        '<path class="usv-edge is-' +
        e.kind +
        (e.dashed ? " is-dashed" : "") +
        '" id="' +
        uid +
        "-edge-" +
        e.id +
        '" d="' +
        pathD(g) +
        '"></path>' +
        '<text class="usv-edge-label" id="' +
        uid +
        "-elabel-" +
        e.id +
        '" x="' +
        qpoint(g, 0.5).x +
        '" y="' +
        qpoint(g, 0.5).y +
        '" text-anchor="middle" data-elabel="' +
        e.id +
        '"></text>'
      );
    }).join("");

    var nodesSvg = Object.keys(NODES)
      .map(function (k) {
        return nodeTemplate(uid, k, NODES[k]);
      })
      .join("");

    var segs = Object.keys(TRACES)
      .map(function (k) {
        return '<button type="button" class="usv-seg-btn" data-trace="' + k + '">' + TRACES[k].label + "</button>";
      })
      .join("");

    container.innerHTML =
      '<div class="usv-toolbar">' +
      '<label class="usv-field"><span class="usv-field-label">Traffic</span>' +
      '<select class="usv-select usv-users" aria-label="Choose a user-count scenario">' +
      usersOpts +
      "</select></label>" +
      '<button type="button" class="usv-btn usv-primary usv-scale">Scale up</button>' +
      '<span class="usv-scale-hint" aria-live="polite"></span>' +
      '<button type="button" class="usv-btn usv-reset">Reset</button>' +
      "</div>" +
      '<div class="usv-tracebar"><span class="usv-tracebar-label">Follow a request</span>' +
      '<div class="usv-seg" role="group" aria-label="Follow a request path">' +
      segs +
      "</div></div>" +
      '<div class="usv-stage sdv-wrap" data-viewport>' +
      '<svg class="usv-svg" viewBox="0 0 1120 660" role="img" aria-label="URL shortener architecture under load">' +
      '<g class="usv-edges">' +
      edgesSvg +
      "</g>" +
      '<g class="usv-dots"></g>' +
      '<g class="usv-nodes">' +
      nodesSvg +
      "</g>" +
      "</svg>" +
      "</div>" +
      '<div class="usv-trace-caption" role="status" aria-live="polite"></div>' +
      '<div class="usv-metrics">' +
      metric("Peak RPS", "rps") +
      metric("p99 latency", "p99") +
      metric("Errors", "err") +
      metric("Cache hit", "hit") +
      metric("Primary qps", "db") +
      metric("Click msg/s", "queue") +
      "</div>" +
      '<div class="usv-narration" role="status" aria-live="polite"></div>' +
      '<dl class="usv-explain" aria-live="polite"></dl>' +
      '<div class="usv-legend">' +
      '<span><i class="usv-swatch is-read"></i>redirect / DB read</span>' +
      '<span><i class="usv-swatch is-cache"></i>cache hit</span>' +
      '<span><i class="usv-swatch is-write"></i>create / write</span>' +
      '<span><i class="usv-swatch is-queue"></i>click analytics</span>' +
      "</div>" +
      '<p class="usv-hint">Traffic assumes peak RPS ≈ DAU × 2% (100:1 read:write). Every redirect emits one click event. Green = under 70% load, amber = 70–100%, red = overloaded and failing.</p>';

    var inst = {
      uid: uid,
      container: container,
      state: Object.assign({}, DEFAULTS),
      model: null,
      lastFix: null,
      trace: "redirect",
      step: 0,
      timer: null,
      dots: [],
      prev: {},
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };

    container.querySelector(".usv-users").addEventListener("change", function (ev) {
      inst.state.users = parseInt(ev.target.value, 10);
      inst.lastFix = null;
      render(inst, {});
    });

    container.querySelector(".usv-scale").addEventListener("click", function () {
      var m = compute(inst.state);
      var key = pickFix(m);
      if (!key) return;
      var before = m;
      var countBefore = inst.state[key];
      var target = Math.max(countBefore + 1, m.required[key]);
      inst.state[key] = target;
      var after = compute(inst.state);
      inst.lastFix = { key: key, added: target - countBefore, before: before, after: after };
      render(inst, bump(key));
    });

    container.querySelector(".usv-reset").addEventListener("click", function () {
      inst.state = Object.assign({}, DEFAULTS);
      inst.lastFix = null;
      container.querySelector(".usv-users").value = String(DEFAULTS.users);
      render(inst, {});
    });

    container.querySelectorAll(".usv-seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-trace");
        inst.trace = inst.trace === k ? null : k;
        inst.step = 0;
        restartTrace(inst);
        applyTrace(inst);
      });
    });

    render(inst, {});
    if (window.SDViewport) window.SDViewport.attach(container.querySelector(".usv-stage"));
    restartTrace(inst);
    applyTrace(inst);

    if (!inst.reduced) {
      var last = performance.now();
      (function frame(now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        var dots = inst.dots;
        for (var i = 0; i < dots.length; i++) {
          var d = dots[i];
          d.t += d.speed * dt;
          if (d.t > 1) d.t -= 1;
          var p = qpoint(d.geo, d.t);
          d.el.setAttribute("cx", p.x);
          d.el.setAttribute("cy", p.y);
        }
        inst.raf = requestAnimationFrame(frame);
      })(last);
    }
  }
  build.count = 0;

  function bump(key) {
    var o = {};
    o[key] = true;
    return o;
  }

  function restartTrace(inst) {
    if (inst.timer) clearInterval(inst.timer);
    inst.timer = null;
    if (!inst.trace || inst.reduced) return;
    inst.timer = setInterval(function () {
      var steps = TRACES[inst.trace].steps;
      inst.step = (inst.step + 1) % steps.length;
      applyTrace(inst);
    }, 2600);
  }

  function chosenEdge(inst, step) {
    if (!step.edge) return null;
    if (step.altEdge && inst.state.replicas > 0) return step.altEdge;
    return step.edge;
  }

  function applyTrace(inst) {
    var c = inst.container;
    c.querySelectorAll(".usv-node.is-trace").forEach(function (n) {
      n.classList.remove("is-trace");
    });
    c.querySelectorAll(".usv-edge.is-trace").forEach(function (e) {
      e.classList.remove("is-trace");
    });
    c.querySelectorAll(".usv-seg-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-trace") === inst.trace);
    });

    var cap = c.querySelector(".usv-trace-caption");
    if (!inst.trace) {
      cap.className = "usv-trace-caption";
      cap.innerHTML = "<strong>Follow a request:</strong> pick <em>Redirect</em>, <em>Create</em>, or <em>Click</em> to trace how a call moves through the system.";
      return;
    }
    var trace = TRACES[inst.trace];
    var step = trace.steps[inst.step];
    var eid = chosenEdge(inst, step);
    if (eid) {
      var el = c.querySelector("#" + inst.uid + "-edge-" + eid);
      if (el) el.classList.add("is-trace");
    }
    step.nodes.forEach(function (n) {
      var g = c.querySelector("#" + inst.uid + "-node-" + n);
      if (g) g.classList.add("is-trace");
    });
    cap.className = "usv-trace-caption is-active";
    cap.innerHTML =
      '<span class="usv-trace-step">' + trace.label + " " + (inst.step + 1) + "/" + trace.steps.length + "</span> " + step.text;
  }

  function setNode(inst, key, util, sub, showBar) {
    var g = inst.container.querySelector("#" + inst.uid + "-node-" + key);
    if (!g) return;
    var lvl = level(util);
    g.classList.toggle("is-warn", lvl === "warn");
    g.classList.toggle("is-danger", lvl === "danger");
    g.querySelector("[data-sub]").textContent = sub;
    var bar = g.querySelector("[data-bar]");
    if (bar && showBar) bar.setAttribute("width", (util == null ? 0 : clamp(util, 0, 1) * 94).toFixed(1));
  }

  function edgeLabel(m, id) {
    switch (id) {
      case "c-api": return fmt(m.rps) + " rps";
      case "api-redis": return Math.round(m.hit * 100) + "% hit";
      case "api-replicas": return "miss " + fmt(m.readsOnReplicas) + "/s";
      case "api-primary": return "miss " + fmt(m.readsOnPrimary) + "/s";
      case "api-idgen": return "create " + fmt(m.writes) + "/s";
      case "idgen-primary": return "write";
      case "api-q": return "click " + fmt(m.ingest) + "/s";
      case "q-w": return "drain";
      case "w-a": return "batch";
      case "primary-replicas": return "replicate";
      default: return "";
    }
  }

  function render(inst, bumpKeys) {
    var m = compute(inst.state);
    inst.model = m;
    var c = inst.container;
    var replicas = inst.state.replicas > 0;

    // node visibility + values
    setNode(inst, "clients", null, fmt(m.rps) + " req/s", false);
    setNode(inst, "api", m.apiUtil, "×" + inst.state.api + " · " + pct(m.apiUtil), true);
    setNode(inst, "redis", m.cacheUtil, "×" + inst.state.redis + " · " + pct(m.cacheUtil), true);
    setNode(inst, "queue", m.queueUtil, fmt(m.ingest) + " msg/s", true);
    setNode(inst, "workers", m.workerUtil, "×" + inst.state.workers + " · " + pct(m.workerUtil), true);
    setNode(inst, "analytics", null, "click store", false);
    setNode(inst, "idgen", null, "counter → Base62", false);
    setNode(inst, "primary", m.primaryUtil, fmt(m.primaryLoad) + " qps · " + pct(m.primaryUtil), true);
    var repNode = c.querySelector("#" + inst.uid + "-node-replicas");
    repNode.style.display = replicas ? "" : "none";
    if (replicas) setNode(inst, "replicas", m.replicaUtil, "×" + inst.state.replicas + " · " + pct(m.replicaUtil), true);

    // edge visibility + labels + danger
    EDGES.forEach(function (e) {
      var el = c.querySelector("#" + inst.uid + "-edge-" + e.id);
      var lab = c.querySelector("#" + inst.uid + "-elabel-" + e.id);
      var visible = true;
      if (e.needsReplicas && !replicas) visible = false;
      if (e.hidesWhenReplicas && replicas) visible = false;
      el.style.display = visible ? "" : "none";
      lab.style.display = visible ? "" : "none";
      if (visible) {
        lab.textContent = edgeLabel(m, e.id);
        var u1 = m.utils[e.from];
        var u2 = m.utils[e.to];
        el.classList.toggle("is-danger", (u1 != null && u1 >= 1) || (u2 != null && u2 >= 1));
      }
    });

    setMetric(c, "rps", fmt(m.rps), level(m.apiUtil));
    setMetric(c, "p99", Math.round(m.p99) + " ms", m.errorRate >= 1 ? "danger" : m.p99 > 250 ? "warn" : "ok");
    setMetric(c, "err", m.errorRate.toFixed(0) + "%", m.errorRate >= 5 ? "danger" : m.errorRate >= 0.5 ? "warn" : "ok");
    setMetric(c, "hit", Math.round(m.hit * 100) + "%", level(m.cacheUtil));
    setMetric(c, "db", fmt(m.primaryLoad) + " qps", level(m.primaryUtil));
    setMetric(c, "queue", fmt(m.ingest) + " /s", level(m.workerUtil));

    var n = narrate(m);
    var narration = c.querySelector(".usv-narration");
    narration.className = "usv-narration is-" + n.cls;
    narration.innerHTML = n.text;

    var fix = pickFix(m);
    var scaleBtn = c.querySelector(".usv-scale");
    var hint = c.querySelector(".usv-scale-hint");
    if (fix) {
      var need = Math.max(1, m.required[fix] - inst.state[fix]);
      scaleBtn.disabled = false;
      scaleBtn.textContent = "Scale up";
      hint.textContent = "→ " + plural(need, UNIT[fix]);
      hint.className = "usv-scale-hint is-" + level(m.utils[fix]);
    } else {
      scaleBtn.disabled = true;
      scaleBtn.textContent = "System healthy";
      hint.textContent = "increase traffic to stress it";
      hint.className = "usv-scale-hint is-ok";
    }

    c.querySelector(".usv-explain").innerHTML = explain(inst, m, fix);

    var prevCounts = inst.prev || {};
    Object.keys(bumpKeys || {}).forEach(function (k) {
      var before = prevCounts[k] == null ? inst.state[k] : prevCounts[k];
      var delta = inst.state[k] - before;
      if (delta <= 0) return;
      var g = c.querySelector("#" + inst.uid + "-node-" + k);
      if (!g) return;
      g.classList.remove("is-new");
      var plus = g.querySelector("[data-plus]");
      if (plus) {
        plus.textContent = "+" + delta;
        plus.classList.remove("is-show");
      }
      void g.getBoundingClientRect();
      g.classList.add("is-new");
      if (plus) plus.classList.add("is-show");
      setTimeout(function () {
        g.classList.remove("is-new");
        if (plus) plus.classList.remove("is-show");
      }, 1100);
    });

    inst.prev = Object.assign({}, inst.state);
    rebuildDots(inst, m);
  }

  function setMetric(c, key, value, lvl) {
    var el = c.querySelector('[data-metric="' + key + '"]');
    if (!el) return;
    el.querySelector(".usv-metric-value").textContent = value;
    el.classList.toggle("is-warn", lvl === "warn");
    el.classList.toggle("is-danger", lvl === "danger");
  }

  function explain(inst, m, fix) {
    var f = inst.lastFix;
    if (f) {
      var bu = f.before.utils[f.key];
      var au = f.after.utils[f.key];
      var rows = [];
      rows.push(
        row(
          "Was failing",
          "<strong>" + UNAME[f.key] + "</strong> at " + pct(bu) +
            (f.before.errorRate >= 1
              ? " — requests were failing (" + f.before.errorRate.toFixed(0) + "% errors, p99 " + Math.round(f.before.p99) + " ms)."
              : " — latency was climbing (p99 " + Math.round(f.before.p99) + " ms).")
        )
      );
      rows.push(row("What we changed", "Added " + plural(f.added, UNIT[f.key]) + " (" + f.before.s[f.key] + " → " + f.after.s[f.key] + ")."));
      rows.push(
        row(
          "What improved",
          UNAME[f.key] + " load " + pct(bu) + " → " + pct(au) +
            "; errors " + f.before.errorRate.toFixed(0) + "% → " + f.after.errorRate.toFixed(0) + "%" +
            "; p99 " + Math.round(f.before.p99) + " → " + Math.round(f.after.p99) + " ms."
        )
      );
      rows.push(row("Why it helps", WHY[f.key]));
      if (f.after.worst < TARGET) rows.push(row("Result", "✅ System healthy — increase traffic to stress it again."));
      else rows.push(row("Next", UNAME[f.after.bottleneck] + " is now the bottleneck at " + pct(f.after.utils[f.after.bottleneck]) + "."));
      return rows.join("");
    }
    if (fix) {
      return (
        row(
          "What's failing",
          "<strong>" + UNAME[fix] + "</strong> at " + pct(m.utils[fix]) +
            (m.errorRate >= 1 ? " — requests are failing (" + m.errorRate.toFixed(0) + "% errors)." : " — latency is climbing.")
        ) +
        row("Why", WHY[fix]) +
        row("Do this", "Press <strong>Scale up</strong> to fix it.")
      );
    }
    return row("Status", "🟢 Healthy. Raise <strong>Traffic</strong> until something turns red, then press <strong>Scale up</strong>.");
  }

  function row(term, desc) {
    return '<div class="usv-row"><dt>' + term + "</dt><dd>" + desc + "</dd></div>";
  }

  function flowFor(e, m) {
    switch (e.id) {
      case "c-api": return m.rps;
      case "api-redis": return m.cachedReads;
      case "api-replicas": return m.readsOnReplicas;
      case "api-primary": return Math.max(1, m.readsOnPrimary);
      case "api-idgen": return Math.max(1, m.writes);
      case "idgen-primary": return Math.max(1, m.writes);
      case "api-q":
      case "q-w":
      case "w-a": return m.ingest;
      case "primary-replicas": return m.readsOnReplicas;
      default: return 0;
    }
  }

  function rebuildDots(inst, m) {
    var layer = inst.container.querySelector(".usv-dots");
    inst.dots = [];
    if (inst.reduced) {
      layer.innerHTML = "";
      return;
    }
    layer.innerHTML = "";
    var visible = EDGES.filter(function (e) {
      if (e.needsReplicas && inst.state.replicas === 0) return false;
      if (e.hidesWhenReplicas && inst.state.replicas > 0) return false;
      return true;
    });
    var flows = visible.map(function (e) {
      return flowFor(e, m);
    });
    var maxFlow = Math.max.apply(null, flows.concat([1]));

    visible.forEach(function (e, i) {
      var flow = flows[i];
      var count = clamp(Math.round((flow / maxFlow) * 5), 1, 5);
      var danger = (m.utils[e.from] != null && m.utils[e.from] >= 1) || (m.utils[e.to] != null && m.utils[e.to] >= 1);
      var color = danger ? "#dc2626" : DOT_COLOR[e.kind];
      var g = edgeGeo(e);
      for (var k = 0; k < count; k++) {
        var circle = document.createElementNS(NS, "circle");
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", color);
        circle.setAttribute("class", "usv-dot");
        layer.appendChild(circle);
        inst.dots.push({ el: circle, geo: g, t: Math.random(), speed: 0.18 + 0.9 * (flow / maxFlow) });
      }
    });
  }

  function narrate(m) {
    if (m.errorRate >= 1 || m.worst >= 1) {
      return {
        cls: "danger",
        text:
          "🔴 <strong>" + UNAME[m.bottleneck] + "</strong> is saturated — the system is failing (" +
          m.errorRate.toFixed(0) + "% errors, p99 " + Math.round(m.p99) + " ms).",
      };
    }
    if (m.worst >= TARGET) {
      return { cls: "warn", text: "🟠 <strong>" + UNAME[m.bottleneck] + "</strong> is running hot at " + pct(m.utils[m.bottleneck]) + ". Headroom is shrinking." };
    }
    return {
      cls: "ok",
      text:
        "🟢 Healthy. " + fmt(m.rps) + " rps rides the cache (" + Math.round(m.hit * 100) + "% hit); the primary DB only sees " +
        fmt(m.primaryLoad) + " qps.",
    };
  }

  function initialize() {
    document.querySelectorAll(".url-shortener-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
