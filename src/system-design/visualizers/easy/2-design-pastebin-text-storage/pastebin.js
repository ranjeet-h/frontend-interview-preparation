/* Pastebin (Easy #2) load & scale visualizer.
   Prefix: pbv-. Plain browser JS, no dependencies. Scopes everything to
   .pastebin-visualizer containers and never touches page code. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  // ---- traffic + capacity assumptions (shown to the learner) -----------------
  var RPS_PER_USER = 0.02; // 2% of DAU active per second
  var READ_SHARE = 0.91; // ~10:1 read:write (pastebin, not 100:1 like shortener)
  var BIG_SHARE = 0.10; // 10% of pastes are big (>64KB) and touch S3
  var API_CAP = 800; // creates+reads per second per API server (10KB payloads are heavier)
  var CACHE_CAP = 20000; // ops/s per Redis node (10KB values are fatter than short codes)
  var BASE_HIT = 0.90; // cache hit rate when Redis is not overloaded
  var PRIMARY_CAP = 2000; // qps the primary DB sustains
  var REPLICA_CAP = 4000; // read qps per read replica
  var S3_CAP = 50000; // ops/s S3 effectively sustains (managed, almost never the bottleneck)
  var TARGET = 0.7; // keep every component under 70% utilization

  var USERS = [
    { label: "1,000 users", value: 1000 },
    { label: "10,000 users", value: 10000 },
    { label: "100,000 users", value: 100000 },
    { label: "1M users", value: 1000000 },
    { label: "10M users", value: 10000000 },
    { label: "100M users", value: 100000000 },
  ];

  var DEFAULTS = { users: 0, api: 2, redis: 1, replicas: 0, shards: 1 };

  var NODES = {
    clients: { x: 80, y: 340, label: "👥 Clients" },
    api: { x: 280, y: 340, label: "⚙️ API" },
    redis: { x: 560, y: 130, label: "⚡ Redis" },
    replicas: { x: 850, y: 210, label: "📚 Replicas" },
    s3: { x: 560, y: 340, label: "🪣 S3 Store" },
    cleaner: { x: 810, y: 340, label: "🧹 Cleaner" },
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
    { id: "api-s3", from: "api", to: "s3", kind: "write" },
    { id: "primary-s3", from: "primary", to: "s3", kind: "read", dashed: true, control: { x: 830, y: 445 } },
    { id: "primary-cleaner", from: "primary", to: "cleaner", kind: "queue" },
    { id: "cleaner-s3", from: "cleaner", to: "s3", kind: "queue", dashed: true },
  ];

  var DOT_COLOR = { read: "#2563eb", cache: "#0891b2", write: "#d97706", queue: "#7c3aed" };

  var TRACES = {
    read: {
      label: "Read",
      steps: [
        { edge: "c-api", nodes: ["clients", "api"], text: "User opens paste.bin/aZ89kL2 → GET /pastes/{id} hits the API." },
        { edge: "api-redis", nodes: ["api", "redis"], text: "The API checks Redis first — hot pastes (≈90% hit) return in ~5ms." },
        { nodes: ["redis"], text: "Redis returns the text. Expiry is checked: expired → 404 even if found." },
        { edge: "c-api", nodes: ["clients", "api"], text: "The API replies 200 with text + syntax for highlighting." },
        { edge: "api-primary", altEdge: "api-replicas", nodes: ["api", "primary"], text: "On the ~10% cache miss, the DB is read (inline text or S3 pointer)." },
      ],
    },
    create: {
      label: "Create",
      steps: [
        { edge: "c-api", nodes: ["clients", "api"], text: "User pastes 5KB code → POST /pastes (size checked at edge, max 1MB)." },
        { edge: "api-idgen", nodes: ["api", "idgen"], text: "The API makes a random 8-char ID — unguessable, so unlisted stays private." },
        { edge: "idgen-primary", nodes: ["idgen", "primary"], text: "Small paste (<64KB) is saved inline in the primary DB." },
        { edge: "api-redis", nodes: ["api", "redis"], text: "A copy is cached in Redis with TTL = time left till expiry." },
      ],
    },
    big: {
      label: "Big paste",
      steps: [
        { edge: "c-api", nodes: ["clients", "api"], text: "User pastes a 500KB log → POST /pastes. Same door, bigger bag." },
        { edge: "api-s3", nodes: ["api", "s3"], text: "Big body (>64KB) goes to the S3 godown — never fattens DB rows." },
        { edge: "idgen-primary", nodes: ["idgen", "primary"], text: "Only the pointer (s3_key) + metadata is saved in the DB." },
        { edge: "primary-cleaner", nodes: ["primary", "cleaner"], text: "Cleaner sweeps expired rows + S3 files in batches. Reads already return 404 via the expiry gate, so lag is safe." },
      ],
    },
  };

  var UNAME = {
    api: "API tier",
    redis: "Redis cache",
    primary: "Primary DB",
    replicas: "Read replicas",
    s3: "S3 object store",
    cleaner: "Cleanup worker",
    shards: "Primary shards",
  };
  var UNIT = { api: "API server", redis: "Redis node", replicas: "read replica", s3: "S3 shard", shards: "primary shard" };
  var WHY = {
    api: "API servers are stateless, so N more servers split the same requests evenly. Big 1MB uploads fill API memory first.",
    redis: "Redis serves hot pastes; more nodes raise the hit rate and keep misses off the DB.",
    replicas: "Read replicas absorb cache misses, so the primary DB is left to handle writes.",
    s3: "S3 is managed and scales itself — if S3 ever looks hot, the real fix is usually more API/Redis, not S3.",
    shards: "Sharding by hash(paste_id) spreads writes across N primaries — each holds 1/N of keys, so write load divides by N.",
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

    var bigWrites = writes * BIG_SHARE;
    var bigMissReads = missReads * BIG_SHARE;
    var s3Load = bigWrites + bigMissReads;
    var s3Util = s3Load / S3_CAP;

    var primaryLoad = writes + readsOnPrimary;
    var shards = Math.max(1, s.shards || 1);
    var primaryUtil = primaryLoad / shards / PRIMARY_CAP;
    var replicaUtil = s.replicas ? readsOnReplicas / replicaCap : null;

    var apiLat = 12 * (1 + Math.max(0, apiUtil - TARGET) * 4);
    var cacheLat = 2 * (1 + Math.max(0, cacheUtil - TARGET) * 3);
    var dbLat = 6 * (1 + Math.max(0, primaryUtil - TARGET) * 6);
    var s3Penalty = (bigMissReads / Math.max(1, rps)) * 40;
    var p99 = 10 + apiLat + cacheLat + dbLat + s3Penalty;

    var over =
      Math.max(0, apiUtil - 1) +
      Math.max(0, primaryUtil - 1) +
      Math.max(0, cacheUtil - 1) * 0.6;
    var errorRate = clamp(over * 30, 0, 100);
    p99 *= 1 + (errorRate / 100) * 1.6;

    var utils = {
      clients: null,
      api: apiUtil,
      redis: cacheUtil,
      replicas: replicaUtil,
      s3: s3Util,
      cleaner: null,
      idgen: null,
      primary: primaryUtil,
      shards: primaryUtil,
    };

    var required = {
      api: Math.max(1, Math.ceil(rps / (API_CAP * TARGET))),
      redis: Math.max(1, Math.ceil(reads / (CACHE_CAP * TARGET))),
      replicas: Math.max(0, Math.ceil((reads * (1 - BASE_HIT)) / (REPLICA_CAP * TARGET))),
      shards: Math.max(1, Math.ceil(primaryLoad / (PRIMARY_CAP * TARGET))),
    };

    var bottleneck = null;
    var worst = 0;
    ["api", "redis", "primary", "replicas"].forEach(function (k) {
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
      bigWrites: bigWrites,
      bigMissReads: bigMissReads,
      s3Load: s3Load,
      cachedReads: cachedReads,
      missReads: missReads,
      readsOnPrimary: readsOnPrimary,
      readsOnReplicas: readsOnReplicas,
      hit: hit,
      apiUtil: apiUtil,
      cacheUtil: cacheUtil,
      s3Util: s3Util,
      primaryLoad: primaryLoad,
      primaryUtil: primaryUtil,
      replicaUtil: replicaUtil,
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
    // Replicas only absorb cache-miss READS. If no miss reads sit on the
    // primary (readsOnPrimary ~ 0), the primary is hot from WRITES and more
    // replicas can never fix it — that needs sharding, not replicas.
    var readDriven = (m.readsOnPrimary || 0) > 1;
    if (readDriven && at("primary") && at("redis")) return "redis";
    var best = null;
    var bestU = 0;
    ["api", "redis", "replicas"].forEach(function (k) {
      if (at(k) && u[k] > bestU) {
        bestU = u[k];
        best = k;
      }
    });
    if (best) return best;
    if (at("primary") && readDriven) return "replicas";
    // Write-bound primary (no miss reads left to offload): shard it so writes divide by N.
    if (at("primary")) return "shards";
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
    var hasBar = key !== "clients" && key !== "cleaner" && key !== "idgen";
    return (
      '<g class="pbv-node" id="' +
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
      '<rect class="pbv-box" x="' +
      -W / 2 +
      '" y="' +
      -H / 2 +
      '" width="' +
      W +
      '" height="' +
      H +
      '" rx="12"></rect>' +
      '<text class="pbv-node-title" x="0" y="-11" text-anchor="middle">' +
      n.label +
      "</text>" +
      '<text class="pbv-node-sub" x="0" y="8" text-anchor="middle" data-sub></text>' +
      (hasBar
        ? '<rect class="pbv-bar-bg" x="-47" y="19" width="94" height="6" rx="3"></rect>' +
          '<rect class="pbv-bar-fill" x="-47" y="19" width="0" height="6" rx="3" data-bar></rect>'
        : "") +
      '<text class="pbv-plus" x="0" y="-38" text-anchor="middle" data-plus>+1</text>' +
      "</g>"
    );
  }

  function metric(label, key) {
    return (
      '<div class="pbv-metric" data-metric="' +
      key +
      '"><span class="pbv-metric-label">' +
      label +
      '</span><span class="pbv-metric-value">–</span></div>'
    );
  }

  function build(container) {
    var uid = "pbv" + build.count;
    build.count += 1;
    container.classList.add("pbv"); // activates the --pbv-* theme variables

    var usersOpts = USERS.map(function (u, i) {
      return '<option value="' + i + '"' + (i === DEFAULTS.users ? " selected" : "") + ">" + u.label + "</option>";
    }).join("");

    var edgesSvg = EDGES.map(function (e) {
      var g = edgeGeo(e);
      return (
        '<path class="pbv-edge is-' +
        e.kind +
        (e.dashed ? " is-dashed" : "") +
        '" id="' +
        uid +
        "-edge-" +
        e.id +
        '" d="' +
        pathD(g) +
        '"></path>' +
        '<text class="pbv-edge-label" id="' +
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
        return '<button type="button" class="pbv-seg-btn" data-trace="' + k + '">' + TRACES[k].label + "</button>";
      })
      .join("");

    container.innerHTML =
      '<div class="pbv-toolbar">' +
      '<label class="pbv-field"><span class="pbv-field-label">Traffic</span>' +
      '<select class="pbv-select pbv-users" aria-label="Choose a user-count scenario">' +
      usersOpts +
      "</select></label>" +
      '<button type="button" class="pbv-btn pbv-primary pbv-scale">Scale up</button>' +
      '<span class="pbv-scale-hint" aria-live="polite"></span>' +
      '<button type="button" class="pbv-btn pbv-reset">Reset</button>' +
      "</div>" +
      '<div class="pbv-tracebar"><span class="pbv-tracebar-label">Follow a request</span>' +
      '<div class="pbv-seg" role="group" aria-label="Follow a request path">' +
      segs +
      "</div></div>" +
      '<div class="pbv-stage sdv-wrap" data-viewport>' +
      '<svg class="pbv-svg" viewBox="0 0 1120 660" role="img" aria-label="Pastebin architecture under load">' +
      '<g class="pbv-edges">' +
      edgesSvg +
      "</g>" +
      '<g class="pbv-dots"></g>' +
      '<g class="pbv-nodes">' +
      nodesSvg +
      "</g>" +
      "</svg>" +
      "</div>" +
      '<div class="pbv-trace-caption" role="status" aria-live="polite"></div>' +
      '<div class="pbv-metrics">' +
      metric("Peak RPS", "rps") +
      metric("p99 latency", "p99") +
      metric("Errors", "err") +
      metric("Cache hit", "hit") +
      metric("Primary qps", "db") +
      metric("S3 ops/s", "s3") +
      "</div>" +
      '<div class="pbv-narration" role="status" aria-live="polite"></div>' +
      '<dl class="pbv-explain" aria-live="polite"></dl>' +
      '<div class="pbv-legend">' +
      '<span><i class="pbv-swatch is-read"></i>read / DB lookup</span>' +
      '<span><i class="pbv-swatch is-cache"></i>cache hit</span>' +
      '<span><i class="pbv-swatch is-write"></i>create / S3 write</span>' +
      '<span><i class="pbv-swatch is-queue"></i>expiry sweep</span>' +
      "</div>" +
      '<p class="pbv-hint">Traffic assumes peak RPS ≈ DAU × 2% (10:1 read:write, 10% big pastes). Small pastes live inline in DB, big pastes live in S3. Green = under 70% load, amber = 70–100%, red = overloaded and failing.</p>';

    var inst = {
      uid: uid,
      container: container,
      state: Object.assign({}, DEFAULTS),
      model: null,
      lastFix: null,
      trace: "read",
      step: 0,
      timer: null,
      dots: [],
      prev: {},
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };

    container.querySelector(".pbv-users").addEventListener("change", function (ev) {
      inst.state.users = parseInt(ev.target.value, 10);
      inst.lastFix = null;
      render(inst, {});
    });

    container.querySelector(".pbv-scale").addEventListener("click", function () {
      var m = compute(inst.state);
      var key = pickFix(m);
      if (!key) return;
      var before = m;
      var countBefore = inst.state[key];
      var target = Math.max(countBefore + 1, m.required[key]);
      inst.state[key] = target;
      var after = compute(inst.state);
      inst.lastFix = { key: key, added: target - countBefore, before: before, after: after };
      render(inst, bump(key === "shards" ? "primary" : key));
    });

    container.querySelector(".pbv-reset").addEventListener("click", function () {
      inst.state = Object.assign({}, DEFAULTS);
      inst.lastFix = null;
      container.querySelector(".pbv-users").value = String(DEFAULTS.users);
      render(inst, {});
    });

    container.querySelectorAll(".pbv-seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-trace");
        inst.trace = inst.trace === k ? null : k;
        inst.step = 0;
        restartTrace(inst);
        applyTrace(inst);
      });
    });

    render(inst, {});
    if (window.SDViewport) window.SDViewport.attach(container.querySelector(".pbv-stage"));
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
    c.querySelectorAll(".pbv-node.is-trace").forEach(function (n) {
      n.classList.remove("is-trace");
    });
    c.querySelectorAll(".pbv-edge.is-trace").forEach(function (e) {
      e.classList.remove("is-trace");
    });
    c.querySelectorAll(".pbv-seg-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-trace") === inst.trace);
    });

    var cap = c.querySelector(".pbv-trace-caption");
    if (!inst.trace) {
      cap.className = "pbv-trace-caption";
      cap.innerHTML = "<strong>Follow a request:</strong> pick <em>Read</em>, <em>Create</em>, or <em>Big paste</em> to trace how a call moves through the system.";
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
    cap.className = "pbv-trace-caption is-active";
    cap.innerHTML =
      '<span class="pbv-trace-step">' + trace.label + " " + (inst.step + 1) + "/" + trace.steps.length + "</span> " + step.text;
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
      case "api-s3": return "big " + fmt(m.bigWrites + m.bigMissReads) + "/s";
      case "primary-s3": return "fetch";
      case "primary-cleaner": return "sweep";
      case "cleaner-s3": return "delete";
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
    setNode(inst, "s3", m.s3Util, fmt(m.s3Load) + " ops · " + pct(m.s3Util), true);
    setNode(inst, "cleaner", null, "TTL sweep", false);
    setNode(inst, "idgen", null, "random 8-char", false);
    setNode(inst, "primary", m.primaryUtil, "×" + inst.state.shards + " · " + fmt(m.primaryLoad) + " qps · " + pct(m.primaryUtil), true);
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
    setMetric(c, "p99", Math.round(m.p99) + " ms", m.errorRate >= 1 ? "danger" : m.p99 > 200 ? "warn" : "ok");
    setMetric(c, "err", m.errorRate.toFixed(0) + "%", m.errorRate >= 5 ? "danger" : m.errorRate >= 0.5 ? "warn" : "ok");
    setMetric(c, "hit", Math.round(m.hit * 100) + "%", level(m.cacheUtil));
    setMetric(c, "db", fmt(m.primaryLoad) + " qps", level(m.primaryUtil));
    setMetric(c, "s3", fmt(m.s3Load) + " /s", level(m.s3Util));

    var n = narrate(m);
    var narration = c.querySelector(".pbv-narration");
    narration.className = "pbv-narration is-" + n.cls;
    narration.innerHTML = n.text;

    var fix = pickFix(m);
    var scaleBtn = c.querySelector(".pbv-scale");
    var hint = c.querySelector(".pbv-scale-hint");
    if (fix) {
      var need = Math.max(1, m.required[fix] - inst.state[fix]);
      var fixUtil = fix === "shards" ? m.utils.primary : m.utils[fix];
      scaleBtn.disabled = false;
      scaleBtn.textContent = fix === "shards" ? "Add shard" : "Scale up";
      hint.textContent = "→ " + plural(need, UNIT[fix]);
      hint.className = "pbv-scale-hint is-" + level(fixUtil);
    } else {
      scaleBtn.disabled = true;
      scaleBtn.textContent = "System healthy";
      hint.textContent = "increase traffic to stress it";
      hint.className = "pbv-scale-hint is-ok";
    }

    c.querySelector(".pbv-explain").innerHTML = explain(inst, m, fix);

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
    el.querySelector(".pbv-metric-value").textContent = value;
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
      var fixUtil = fix === "shards" ? m.utils.primary : m.utils[fix];
      var fixAction = fix === "shards" ? "Add shard" : "Scale up";
      return (
        row(
          "What's failing",
          "<strong>" + UNAME[fix] + "</strong> at " + pct(fixUtil) +
            (m.errorRate >= 1 ? " — requests are failing (" + m.errorRate.toFixed(0) + "% errors)." : " — latency is climbing.") +
            (fix === "shards" ? " Saturated by " + fmt(m.writes) + "/s writes — replicas can't take writes." : "")
        ) +
        row("Why", WHY[fix]) +
        row("Do this", "Press <strong>" + fixAction + "</strong> to fix it.")
      );
    }
    return row("Status", "🟢 Healthy. Raise <strong>Traffic</strong> until something turns red, then press <strong>Scale up</strong>.");
  }

  function row(term, desc) {
    return '<div class="pbv-row"><dt>' + term + "</dt><dd>" + desc + "</dd></div>";
  }

  function flowFor(e, m) {
    switch (e.id) {
      case "c-api": return m.rps;
      case "api-redis": return m.cachedReads;
      case "api-replicas": return m.readsOnReplicas;
      case "api-primary": return Math.max(1, m.readsOnPrimary + m.writes * 0.9);
      case "api-idgen": return Math.max(1, m.writes);
      case "idgen-primary": return Math.max(1, m.writes);
      case "api-s3": return Math.max(1, m.bigWrites + m.bigMissReads);
      case "primary-s3": return Math.max(1, m.bigMissReads);
      case "primary-cleaner": return Math.max(1, m.writes);
      case "cleaner-s3": return Math.max(1, m.writes * 0.2);
      default: return 0;
    }
  }

  function rebuildDots(inst, m) {
    var layer = inst.container.querySelector(".pbv-dots");
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
        circle.setAttribute("class", "pbv-dot");
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
        fmt(m.primaryLoad) + " qps, S3 sees " + fmt(m.s3Load) + " ops.",
    };
  }

  function initialize() {
    document.querySelectorAll(".pastebin-visualizer").forEach(function (container) {
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
