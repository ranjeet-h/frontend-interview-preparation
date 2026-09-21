/* Cache (LLD) visualizer: capacity + eviction policy (LRU/LFU/FIFO) + TTL,
   with the shared LLD design lens. Prefix: cav-. No dependencies. */
(function () {
  "use strict";

  var CAP = 5, TTL = 5;
  var KEYS = ["A", "B", "C", "D", "E", "F"];

  function build(container) {
    var uid = "cav" + build.count;
    build.count += 1;
    container.classList.add("cav");

    var inst = {
      uid: uid,
      container: container,
      map: {},
      clock: 0,
      hits: 0, misses: 0, evictions: 0, expired: 0,
      log: [],
      lastVictim: null,
      speed: 1,
      timer: null,
      strategy: { eviction: "lru", ttl: "on" },
      lens: null,
      lastDecision: "Put and Get keys. When full, the EvictionPolicy picks a victim.",
    };

    var keyOpts = KEYS.map(function (k) { return '<option value="' + k + '">' + k + "</option>"; }).join("");

    container.innerHTML =
      '<div class="cav-toolbar">' +
      '<button type="button" class="cav-btn cav-primary cav-play">▶ Play</button>' +
      '<button type="button" class="cav-btn cav-reset">Reset</button>' +
      '<span class="cav-sep"></span>' +
      '<label class="cav-field">Key <select class="cav-select cav-key">' + keyOpts + "</select></label>" +
      '<button type="button" class="cav-btn cav-primary cav-get">Get</button>' +
      '<button type="button" class="cav-btn cav-primary cav-put">Put</button>' +
      "</div>" +
      '<div class="cav-slots" data-slots></div>' +
      '<div class="cav-log" data-log></div>' +
      '<div class="cav-caption" role="status" aria-live="polite"></div>' +
      '<div class="cav-metrics">' +
      metric("Size", "size") + metric("Hits", "hits") + metric("Misses", "misses") + metric("Hit rate", "rate") + metric("Evictions", "evict") +
      "</div>" +
      '<div class="cav-lens" data-lens></div>' +
      '<p class="cav-hint">Cards are shown <b>most-recently-used first</b>, so the LRU victim is always the last card. LRU is a hash map plus a doubly linked list: <b>get</b> and <b>evict</b> are both O(1).</p>';

    container.querySelector(".cav-get").addEventListener("click", function () { get(inst, container.querySelector(".cav-key").value); });
    container.querySelector(".cav-put").addEventListener("click", function () { put(inst, container.querySelector(".cav-key").value, 10 + Math.floor(Math.random() * 90)); });
    container.querySelector(".cav-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".cav-reset").addEventListener("click", function () { reset(inst); });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="cav-metric"><span class="cav-metric-label">' + label + '</span><span class="cav-metric-value" data-metric="' + key + '">–</span></div>';
  }

  function size(inst) { return Object.keys(inst.map).length; }

  function expired(inst, e) { return inst.strategy.ttl === "on" && e.expiresAt <= inst.clock; }

  function sweep(inst) {
    var removed = 0;
    Object.keys(inst.map).forEach(function (k) {
      if (expired(inst, inst.map[k])) { delete inst.map[k]; inst.expired += 1; removed += 1; }
    });
    return removed;
  }

  function selectVictim(inst) {
    var keys = Object.keys(inst.map);
    if (!keys.length) return null;
    var best = keys[0], be = inst.map[best];
    keys.forEach(function (k) {
      var e = inst.map[k];
      var better;
      if (inst.strategy.eviction === "lfu") better = e.freq < be.freq || (e.freq === be.freq && e.lastUsedAt < be.lastUsedAt);
      else if (inst.strategy.eviction === "fifo") better = e.insertedAt < be.insertedAt;
      else better = e.lastUsedAt < be.lastUsedAt;
      if (better) { best = k; be = e; }
    });
    return best;
  }

  function log(inst, text, cls) {
    inst.log.unshift({ text: text, cls: cls || "" });
    if (inst.log.length > 8) inst.log.pop();
  }

  function get(inst, key) {
    inst.clock += 1;
    sweep(inst);
    var e = inst.map[key];
    if (!e) {
      inst.misses += 1;
      log(inst, "GET " + key + " → miss", "miss");
      inst.lastDecision = "get(" + key + "): miss — Storage.get returned null.";
      trace(inst, ["Cache", "Storage"], [
        { cls: "Cache", method: "get" },
        { cls: "Storage", method: "get" },
      ]);
      render(inst); return;
    }
    e.lastUsedAt = inst.clock; e.freq += 1;
    inst.hits += 1;
    inst.flashKey = key;
    log(inst, "GET " + key + " → " + e.value, "hit");
    inst.lastDecision = "get(" + key + ") hit: value " + e.value + ". EvictionPolicy.onAccess updated " + (inst.strategy.eviction === "lfu" ? "frequency to " + e.freq : "recency") + ".";
    trace(inst, ["Cache", "EvictionPolicy"], [
      { cls: "Cache", method: "get" },
      { cls: "Storage", method: "get" },
      { cls: "EvictionPolicy", method: "onAccess" },
    ]);
    render(inst);
  }

  function put(inst, key, value) {
    inst.clock += 1;
    sweep(inst);
    var e = inst.map[key];
    if (e) {
      e.value = value; e.lastUsedAt = inst.clock; e.freq += 1;
      if (inst.strategy.ttl === "on") e.expiresAt = inst.clock + TTL;
      log(inst, "PUT " + key + "=" + value + " (update)");
      inst.lastDecision = "put(" + key + ", " + value + ") updated an existing key — size unchanged, counts as an access.";
      render(inst); return;
    }
    var victim = null;
    if (size(inst) >= CAP) {
      victim = selectVictim(inst);
      delete inst.map[victim];
      inst.evictions += 1;
      inst.lastVictim = victim;
      inst._evictedAt = inst.clock;
      log(inst, "evict " + victim + " (" + inst.strategy.eviction.toUpperCase() + ")", "evict");
    }
    inst.map[key] = { key: key, value: value, insertedAt: inst.clock, lastUsedAt: inst.clock, freq: 1, expiresAt: inst.clock + TTL };
    log(inst, "PUT " + key + "=" + value);
    inst.lastDecision = "put(" + key + ", " + value + ")" +
      (victim ? " — full, so EvictionPolicy.selectVictim() chose " + victim + " (" + inst.strategy.eviction.toUpperCase() + ")." : " — inserted (size " + size(inst) + "/" + CAP + ").");
    trace(inst, victim ? ["Cache", "EvictionPolicy", "Storage"] : ["Cache", "Storage"], victim ? [
      { cls: "Cache", method: "put" },
      { cls: "EvictionPolicy", method: "selectVictim" },
      { cls: "Storage", method: "remove" },
      { cls: "EvictionPolicy", method: "onInsert" },
    ] : [
      { cls: "Cache", method: "put" },
      { cls: "Storage", method: "put" },
      { cls: "EvictionPolicy", method: "onInsert" },
    ]);
    render(inst);
  }

  function trace(inst, _u, steps) {
    if (!inst.lens) return;
    inst._traced = true;
    var active = {};
    steps.forEach(function (s) { active[s.cls] = true; });
    inst.lens.setActive(Object.keys(active));
    inst.lens.setTrace(steps);
  }

  function tick(inst) {
    var key = KEYS[Math.floor(Math.random() * KEYS.length)];
    if (Math.random() < 0.5) get(inst, key); else put(inst, key, 10 + Math.floor(Math.random() * 90));
  }
  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".cav-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 950 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".cav-play");
    if (b) b.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }
  function reset(inst) {
    pause(inst);
    inst.map = {}; inst.clock = 0; inst.hits = 0; inst.misses = 0; inst.evictions = 0; inst.expired = 0; inst.log = []; inst.lastVictim = null;
    inst.lastDecision = "Reset."; render(inst);
  }

  function render(inst) {
    var c = inst.container;
    var entries = Object.keys(inst.map).map(function (k) { return inst.map[k]; });
    entries.sort(function (a, b) { return b.lastUsedAt - a.lastUsedAt; }); // most recent first

    var html = "";
    entries.forEach(function (e) {
      var isEvicted = inst.lastVictim === e.key && inst._evictedAt === inst.clock;
      var cls = "cav-slot" + (inst.flashKey === e.key ? " is-hit" : "");
      var ttl = inst.strategy.ttl === "on" ? Math.max(0, e.expiresAt - inst.clock) : null;
      html += '<div class="' + cls + '" data-slot="' + e.key + '">' +
        '<div class="cav-key">' + e.key + "</div>" +
        '<div class="cav-val">value ' + e.value + "</div>" +
        '<div class="cav-meta"><span class="cav-badge freq">freq ' + e.freq + "</span>" +
        '<span class="cav-badge">used t' + e.lastUsedAt + "</span>" +
        (ttl !== null ? '<span class="cav-badge ttl">ttl ' + ttl + "</span>" : "") +
        "</div></div>";
    });
    for (var i = entries.length; i < CAP; i++) html += '<div class="cav-slot is-empty"><span class="cav-empty-label">empty</span></div>';
    c.querySelector("[data-slots]").innerHTML = html;

    // show the last eviction as a faded ghost card
    if (inst.lastVictim && inst._evictedAt === inst.clock) {
      c.querySelector("[data-slots]").insertAdjacentHTML("beforeend",
        '<div class="cav-slot is-evicted"><div class="cav-key">' + inst.lastVictim + " ✕</div><div class=\"cav-val\">evicted (" + inst.strategy.eviction.toUpperCase() + ")</div></div>");
    }
    inst.flashKey = null;

    c.querySelector("[data-log]").innerHTML = inst.log.map(function (l) {
      return '<span class="cav-logitem ' + l.cls + '">' + l.text + "</span>";
    }).join("");

    var cap = c.querySelector(".cav-caption");
    cap.textContent = inst.lastDecision;

    var total = inst.hits + inst.misses;
    setMetric(c, "size", size(inst) + " / " + CAP);
    setMetric(c, "hits", inst.hits);
    setMetric(c, "misses", inst.misses);
    setMetric(c, "rate", total ? Math.round((inst.hits / total) * 100) + "%" : "—");
    setMetric(c, "evict", inst.evictions);

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["Cache", "EvictionPolicy"]);
      inst.lens.setTrace([{ cls: "Cache", method: "get" }]);
    }
    inst._traced = false;
  }

  function setMetric(c, key, value) {
    var el = c.querySelector('[data-metric="' + key + '"]');
    if (el) el.textContent = value;
  }

  function lensConfig(inst) {
    return {
      classes: [
        { id: "Cache", label: "Cache", stereotype: "class", x: 150, y: 90,
          owns: "Capacity, the map, and get/put/evict orchestration.",
          invariant: "size ≤ capacity, and every key in the policy's list is in the map.",
          fields: ["capacity", "storage", "policy", "ttl", "stats"], methods: ["get(key)", "put(key,value)", "delete(key)"] },
        { id: "Storage", label: "Storage", stereotype: "class", x: 150, y: 280, owns: "O(1) key → entry lookup.", fields: ["map: Map<Key,CacheEntry>"], methods: ["get(key)", "put(key,entry)", "remove(key)"] },
        { id: "CacheEntry", label: "CacheEntry", stereotype: "class", x: 150, y: 470, owns: "Value plus the metadata a policy needs.", fields: ["key", "value", "insertedAt", "lastUsedAt", "frequency"] },
        { id: "CacheStats", label: "CacheStats", stereotype: "class", x: 150, y: 650, owns: "Hit/miss/eviction counters.", fields: ["hits", "misses", "evictions"] },
        { id: "EvictionPolicy", label: "EvictionPolicy", stereotype: "interface", x: 460, y: 90, owns: "Chooses the victim; owns its ordering structure.", methods: ["onAccess(e)", "onInsert(e)", "selectVictim()"] },
        { id: "LruPolicy", label: "LruPolicy", stereotype: "class", x: 460, y: 280, owns: "Least recently used; map + doubly linked list (O(1)).", methods: ["selectVictim()"] },
        { id: "LfuPolicy", label: "LfuPolicy", stereotype: "class", x: 460, y: 470, owns: "Least frequently used; frequency index.", methods: ["selectVictim()"] },
        { id: "FifoPolicy", label: "FifoPolicy", stereotype: "class", x: 460, y: 650, owns: "Oldest inserted.", methods: ["selectVictim()"] },
        { id: "TtlManager", label: "TtlManager", stereotype: "class", x: 770, y: 90, owns: "Expiry; decorates the cache.", methods: ["isExpired(entry, now)"] },
        { id: "Clock", label: "Clock", stereotype: "interface", x: 770, y: 280, owns: "Time source so TTL is testable.", methods: ["now()"] },
      ],
      edges: [
        { from: "Cache", to: "Storage", kind: "composition" },
        { from: "Cache", to: "EvictionPolicy", kind: "aggregation" },
        { from: "Cache", to: "TtlManager", kind: "composition" },
        { from: "Cache", to: "CacheStats", kind: "composition" },
        { from: "Storage", to: "CacheEntry", kind: "aggregation" },
        { from: "LruPolicy", to: "EvictionPolicy", kind: "implements" },
        { from: "LfuPolicy", to: "EvictionPolicy", kind: "implements" },
        { from: "FifoPolicy", to: "EvictionPolicy", kind: "implements" },
        { from: "TtlManager", to: "Clock", kind: "depends" },
      ],
      patterns: [
        { id: "strategy", label: "Strategy", classes: ["EvictionPolicy", "LruPolicy", "LfuPolicy", "FifoPolicy"],
          note: "Victim selection is a strategy. Swap LRU ↔ LFU ↔ FIFO and the same get/put behaves differently under the same access pattern." },
        { id: "decorator", label: "Decorator", classes: ["Cache", "TtlManager"],
          note: "TTL wraps the cache with expiry without changing the eviction policy or the storage." },
      ],
      strategyGroups: [
        { id: "eviction", label: "EvictionPolicy", options: [
            { id: "lru", label: "LRU", note: "Evict the least recently used entry. Map + doubly linked list → O(1) access and eviction." },
            { id: "lfu", label: "LFU", note: "Evict the least frequently used entry (tie: least recently used)." },
            { id: "fifo", label: "FIFO", note: "Evict the oldest inserted entry, regardless of use." },
          ], default: "lru", classMap: { lru: "LruPolicy", lfu: "LfuPolicy", fifo: "FifoPolicy" },
          onChange: function (id) { inst.strategy.eviction = id; inst.lastDecision = "EvictionPolicy = " + id.toUpperCase() + "."; render(inst); } },
        { id: "ttl", label: "TTL", options: [
            { id: "on", label: "On (5 ticks)", note: "Entries expire after 5 ticks and are removed lazily on access (and swept)." },
            { id: "off", label: "Off", note: "No expiry; only capacity eviction removes entries." },
          ], default: "on", classMap: { on: "TtlManager", off: "TtlManager" },
          onChange: function (id) { inst.strategy.ttl = id; inst.lastDecision = "TTL = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["Cache", "CacheEntry"], note: "get/put/delete, fixed capacity, eviction policy, TTL, stats." },
        { n: 2, label: "Core Entities", classes: ["Storage", "EvictionPolicy"], note: "Nouns: cache, entry, storage, policy, ttl manager, stats." },
        { n: 3, label: "Responsibilities", classes: ["Cache", "EvictionPolicy"], note: "Cache orchestrates; policy owns victim selection and its ordering structure." },
        { n: 4, label: "Relationships + Interfaces", classes: ["EvictionPolicy", "TtlManager", "Clock"], note: "Has-a for storage/policy/ttl; interfaces at policy and clock." },
        { n: 5, label: "Class Diagram", classes: ["Cache", "Storage", "EvictionPolicy"], note: "The cache composition and the policy hierarchy." },
        { n: 6, label: "Core Flows", classes: ["Cache", "EvictionPolicy"], note: "get (hit/miss + onAccess), put (update/insert/evict)." },
        { n: 7, label: "Critical Code", classes: ["LruPolicy", "LfuPolicy"], note: "LRU as map + doubly linked list; the O(1) claim is the crux." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["EvictionPolicy", "TtlManager"], note: "Capacity 1, update vs insert, TTL vs eviction, tie-breaking, concurrency." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".cache-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
