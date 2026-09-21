/* Logger (LLD) visualizer: levels, chain of appenders, async queue, formatters,
   with the shared LLD design lens. Prefix: lgv-. No dependencies. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
  var MSGS = ["user 42 logged in", "cache miss for /api/items", "payment declined", "retrying request", "health check ok"];
  var QUEUE_MAX = 8;
  var VW = 900, VH = 220;

  var NODES = {
    logger: { x: 90, y: 110, label: "Logger", sub: "entry point" },
    filter: { x: 290, y: 110, label: "Level filter", sub: "logger threshold" },
    queue: { x: 490, y: 110, label: "Async queue", sub: "bounded" },
    console: { x: 720, y: 40, label: "Console", sub: "sink" },
    file: { x: 720, y: 110, label: "File", sub: "sink" },
    network: { x: 720, y: 180, label: "Network", sub: "sink" },
  };
  var NW = 124, NH = 50;
  var EDGES = [["logger", "filter"], ["filter", "queue"], ["queue", "console"], ["queue", "file"], ["queue", "network"]];

  function levelIdx(l) { return LEVELS.indexOf(l); }
  function time(inst) { var s = 12 * 3600 + inst.clock; var h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, sec = s % 60; return pad(h) + ":" + pad(m) + ":" + pad(sec); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function build(container) {
    var uid = "lgv" + build.count;
    build.count += 1;
    container.classList.add("lgv");

    var inst = {
      uid: uid,
      container: container,
      loggerLevel: "INFO",
      sinks: {
        console: { level: "INFO", lines: [] },
        file: { level: "WARN", lines: [] },
        network: { level: "ERROR", lines: [] },
      },
      queue: [],
      async: true,
      clock: 0,
      emitted: 0,
      filtered: 0,
      written: 0,
      dropped: 0,
      blocked: 0,
      speed: 1,
      timer: null,
      drainTimer: null,
      strategy: { format: "plain", dropPolicy: "dropOldest" },
      lens: null,
      lastDecision: "Emit a log: Logger → level filter → queue → Console / File / Network.",
    };

    var nodesSvg = Object.keys(NODES).map(function (k) {
      var n = NODES[k];
      return '<g class="lgv-node" data-node="' + k + '" transform="translate(' + n.x + "," + n.y + ')">' +
        '<rect class="lgv-box" x="' + (-NW / 2) + '" y="' + (-NH / 2) + '" width="' + NW + '" height="' + NH + '" rx="10"></rect>' +
        '<text class="lgv-label" x="0" y="-2" text-anchor="middle">' + n.label + "</text>" +
        '<text class="lgv-sub" x="0" y="14" text-anchor="middle">' + n.sub + "</text></g>";
    }).join("");
    var edgesSvg = EDGES.map(function (e) {
      var a = NODES[e[0]], b = NODES[e[1]];
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      var sx = a.x + ux * (NW / 2), sy = a.y + uy * (NH / 2), ex = b.x - ux * (NW / 2 + 10), ey = b.y - uy * (NH / 2 + 10);
      var ang = Math.atan2(ey - sy, ex - sx), L = 10, W = 7;
      var px = -Math.sin(ang), py = Math.cos(ang), cxx = Math.cos(ang), cyy = Math.sin(ang);
      var arrow = [[ex, ey], [ex - cxx * L + px * W / 2, ey - cyy * L + py * W / 2], [ex - cxx * L - px * W / 2, ey - cyy * L - py * W / 2]];
      return '<line class="lgv-edge" x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '"></line>' +
        '<polygon class="lgv-arrow" points="' + arrow.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"></polygon>';
    }).join("");

    var levelOpts = LEVELS.map(function (l) { return '<option value="' + l + '"' + (l === "INFO" ? " selected" : "") + ">" + l + "</option>"; }).join("");
    function sinkOpts(sel) { return LEVELS.map(function (l) { return '<option value="' + l + '"' + (l === sel ? " selected" : "") + ">" + l + "</option>"; }).join(""); }

    container.innerHTML =
      '<div class="lgv-toolbar">' +
      '<button type="button" class="lgv-btn lgv-primary lgv-play">▶ Play</button>' +
      '<button type="button" class="lgv-btn lgv-emit">Emit log</button>' +
      '<button type="button" class="lgv-btn lgv-reset">Reset</button>' +
      '<span class="lgv-sep"></span>' +
      '<label class="lgv-field">Level <select class="lgv-select lgv-level">' + levelOpts + "</select></label>" +
      '<label class="lgv-field">Logger threshold <select class="lgv-select lgv-threshold">' + sinkOpts("INFO") + "</select></label>" +
      '<label class="lgv-check"><input type="checkbox" class="lgv-async" checked> async (non-blocking)</label>' +
      "</div>" +
      '<div class="lgv-row">' +
      '<label class="lgv-field">Console ≥ <select class="lgv-select" data-sinklevel="console">' + sinkOpts("INFO") + "</select></label>" +
      '<label class="lgv-field">File ≥ <select class="lgv-select" data-sinklevel="file">' + sinkOpts("WARN") + "</select></label>" +
      '<label class="lgv-field">Network ≥ <select class="lgv-select" data-sinklevel="network">' + sinkOpts("ERROR") + "</select></label>" +
      '<span class="lgv-field">queue <b data-qdepth>0</b> / ' + QUEUE_MAX + "</span>" +
      "</div>" +
      '<div class="lgv-stage"><svg class="lgv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Logging pipeline">' + edgesSvg + nodesSvg + "</svg></div>" +
      '<div class="lgv-sinks">' +
      ["console", "file", "network"].map(function (s) {
        return '<div class="lgv-sink"><div class="lgv-sink-head">' + s.charAt(0).toUpperCase() + s.slice(1) + ' <span data-sinkhead="' + s + '"></span></div><pre class="lgv-log" data-log="' + s + '"></pre></div>';
      }).join("") +
      "</div>" +
      '<div class="lgv-caption" role="status" aria-live="polite"></div>' +
      '<div class="lgv-metrics">' +
      metric("Emitted", "emitted") + metric("Filtered", "filtered") + metric("Written", "written") + metric("Dropped", "dropped") + metric("Blocked", "blocked") +
      "</div>" +
      '<div class="lgv-lens" data-lens></div>' +
      '<p class="lgv-hint">The hot path must not do I/O: with <b>async</b> on, <b>AsyncAppender.enqueue</b> returns immediately and a worker drains the queue. When the queue is full the drop policy decides.</p>';

    // ---- events -------------------------------------------------------------
    container.querySelector(".lgv-emit").addEventListener("click", function () {
      emit(inst, container.querySelector(".lgv-level").value, MSGS[Math.floor(Math.random() * MSGS.length)]);
    });
    container.querySelector(".lgv-threshold").addEventListener("change", function (e) { inst.loggerLevel = e.target.value; inst.lastDecision = "Logger threshold = " + inst.loggerLevel + "."; render(inst); });
    container.querySelector(".lgv-async").addEventListener("change", function (e) { inst.async = e.target.checked; inst.lastDecision = "async = " + inst.async + "."; render(inst); });
    container.querySelectorAll("[data-sinklevel]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        inst.sinks[sel.getAttribute("data-sinklevel")].level = sel.value;
        inst.lastDecision = sel.getAttribute("data-sinklevel") + " threshold = " + sel.value + ".";
        render(inst);
      });
    });
    container.querySelector(".lgv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".lgv-reset").addEventListener("click", function () { reset(inst); });

    inst.drainTimer = setInterval(function () { drain(inst); }, 240);

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="lgv-metric"><span class="lgv-metric-label">' + label + '</span><span class="lgv-metric-value" data-metric="' + key + '">–</span></div>';
  }

  function emit(inst, level, msg) {
    inst.emitted += 1;
    inst.clock += 1;
    if (levelIdx(level) < levelIdx(inst.loggerLevel)) {
      inst.filtered += 1;
      inst.lastDecision = "log(" + level + ") dropped by the Logger threshold (" + inst.loggerLevel + ") before any sink.";
      flash(inst, ["logger", "filter"]);
      trace(inst, ["Logger", "LevelFilter"], [
        { cls: "Logger", method: "log" },
        { cls: "LevelFilter", method: "accept" },
      ]);
      render(inst); return;
    }
    var record = { level: level, msg: msg, ts: time(inst), req: "req-" + (1 + (inst.emitted % 5)) };
    flash(inst, ["logger", "filter"]);
    if (inst.async) {
      inst.lastDecision = "log(" + level + ") → AsyncAppender.enqueue → returns immediately (hot path).";
      trace(inst, ["AsyncAppender", "Appender", "Formatter"], [
        { cls: "Logger", method: "log" },
        { cls: "AsyncAppender", method: "enqueue" },
        { cls: "Appender", method: "append" },
        { cls: "Formatter", method: "format" },
      ]);
      enqueue(inst, record);
    } else {
      inst.lastDecision = "log(" + level + ") → synchronous append (I/O on the caller's thread).";
      trace(inst, ["Appender", "Formatter"], [
        { cls: "Logger", method: "log" },
        { cls: "Appender", method: "append" },
        { cls: "Formatter", method: "format" },
      ]);
      writeToSinks(inst, record);
    }
    render(inst);
  }

  function enqueue(inst, record) {
    if (inst.queue.length >= QUEUE_MAX) {
      if (inst.strategy.dropPolicy === "dropOldest") {
        inst.queue.shift(); inst.dropped += 1;
        inst.lastDecision += " Queue full → drop-oldest (dropped " + inst.dropped + ").";
      } else {
        inst.blocked += 1;
        inst.lastDecision += " Queue full → caller blocks (backpressure).";
      }
    }
    inst.queue.push(record);
    flash(inst, ["queue"]);
  }

  function drain(inst) {
    if (!inst.async || !inst.queue.length) return;
    var record = inst.queue.shift();
    writeToSinks(inst, record);
    render(inst);
  }

  function writeToSinks(inst, record) {
    ["console", "file", "network"].forEach(function (s) {
      var sink = inst.sinks[s];
      if (levelIdx(record.level) < levelIdx(sink.level)) return;
      sink.lines.push(format(inst, record));
      if (sink.lines.length > 8) sink.lines.shift();
      inst.written += 1;
      flash(inst, [s]);
    });
  }

  function format(inst, record) {
    if (inst.strategy.format === "json") {
      return '{"ts":"' + record.ts + '","level":"' + record.level + '","msg":"' + record.msg + '","req":"' + record.req + '"}';
    }
    return record.ts + " " + record.level.padEnd(5) + " [" + record.req + "] " + record.msg;
  }

  function flash(inst, keys) {
    keys.forEach(function (k) {
      var el = inst.container.querySelector('[data-node="' + k + '"]');
      if (!el) return;
      el.classList.add("is-active");
      setTimeout(function () { el.classList.remove("is-active"); }, 350);
    });
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
    var r = Math.random();
    var level = r < 0.3 ? "DEBUG" : r < 0.7 ? "INFO" : r < 0.9 ? "WARN" : "ERROR";
    emit(inst, level, MSGS[Math.floor(Math.random() * MSGS.length)]);
  }

  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".lgv-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 720 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".lgv-play");
    if (b) b.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }
  function reset(inst) {
    pause(inst);
    inst.queue = [];
    inst.emitted = 0; inst.filtered = 0; inst.written = 0; inst.dropped = 0; inst.blocked = 0; inst.clock = 0;
    ["console", "file", "network"].forEach(function (s) { inst.sinks[s].lines = []; });
    inst.lastDecision = "Reset."; render(inst);
  }

  function render(inst) {
    var c = inst.container;
    ["console", "file", "network"].forEach(function (s) {
      var sink = inst.sinks[s];
      c.querySelector('[data-sinkhead="' + s + '"]').textContent = "≥ " + sink.level;
      c.querySelector('[data-log="' + s + '"]').innerHTML = sink.lines.map(function (l) {
        var lvl = l.indexOf("ERROR") !== -1 ? "error" : l.indexOf("WARN") !== -1 ? "warn" : l.indexOf("INFO") !== -1 ? "info" : l.indexOf("DEBUG") !== -1 ? "debug" : "trace";
        return '<span class="lgv-line lgv-' + lvl + '">' + escapeHtml(l) + "</span>";
      }).join("\n");
    });

    c.querySelector("[data-qdepth]").textContent = inst.queue.length;
    var cap = c.querySelector(".lgv-caption");
    cap.textContent = inst.lastDecision;
    cap.className = "lgv-caption" + (inst.dropped ? " is-bad" : "");

    setMetric(c, "emitted", inst.emitted);
    setMetric(c, "filtered", inst.filtered);
    setMetric(c, "written", inst.written);
    setMetric(c, "dropped", inst.dropped);
    setMetric(c, "blocked", inst.blocked);

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["Logger", "Appender"]);
      inst.lens.setTrace([{ cls: "Logger", method: "log" }]);
    }
    inst._traced = false;
  }

  function escapeHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function setMetric(c, key, value) {
    var el = c.querySelector('[data-metric="' + key + '"]');
    if (el) el.textContent = value;
  }

  function lensConfig(inst) {
    return {
      classes: [
        { id: "Logger", label: "Logger", stereotype: "class", x: 150, y: 90,
          owns: "Entry point: applies its threshold and offers the record to its appenders.",
          fields: ["name", "level", "appenders"], methods: ["log(level,msg)", "addAppender(a)"] },
        { id: "LogRecord", label: "LogRecord", stereotype: "class", x: 150, y: 260, owns: "The immutable event.", fields: ["level", "message", "timestamp", "correlationId"] },
        { id: "LogLevel", label: "LogLevel", stereotype: "enum", x: 150, y: 430, owns: "Ordered value object.", fields: ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"] },
        { id: "LoggerConfig", label: "LoggerConfig", stereotype: "class", x: 150, y: 600, owns: "Wiring of levels and appenders.", fields: ["rootLevel", "appenderLevels"] },
        { id: "Appender", label: "Appender", stereotype: "interface", x: 450, y: 90, owns: "Writes one record to one sink.", methods: ["append(record)"] },
        { id: "ConsoleAppender", label: "ConsoleAppender", stereotype: "class", x: 450, y: 260, owns: "stdout sink.", methods: ["append()"] },
        { id: "FileAppender", label: "FileAppender", stereotype: "class", x: 450, y: 430, owns: "file sink.", methods: ["append()"] },
        { id: "NetworkAppender", label: "NetworkAppender", stereotype: "class", x: 450, y: 600, owns: "remote sink.", methods: ["append()"] },
        { id: "Formatter", label: "Formatter", stereotype: "interface", x: 760, y: 90, owns: "Renders a record to a string.", methods: ["format(record)"] },
        { id: "PlainFormatter", label: "PlainFormatter", stereotype: "class", x: 760, y: 260, owns: "Human-readable line.", methods: ["format()"] },
        { id: "JsonFormatter", label: "JsonFormatter", stereotype: "class", x: 760, y: 430, owns: "Structured JSON line.", methods: ["format()"] },
        { id: "LevelFilter", label: "LevelFilter", stereotype: "class", x: 760, y: 600, owns: "Pass/fail by level.", methods: ["accept(record)"] },
        { id: "AsyncAppender", label: "AsyncAppender", stereotype: "class", x: 760, y: 770,
          owns: "Bounded queue + worker; decorates a target appender.",
          invariant: "The hot path never blocks on I/O when async is on.",
          methods: ["enqueue(record)", "drain()"] },
      ],
      edges: [
        { from: "Logger", to: "Appender", kind: "aggregation" },
        { from: "Logger", to: "LogRecord", kind: "depends" },
        { from: "Logger", to: "LoggerConfig", kind: "depends" },
        { from: "Logger", to: "LevelFilter", kind: "depends" },
        { from: "LogRecord", to: "LogLevel", kind: "association" },
        { from: "Appender", to: "Formatter", kind: "depends" },
        { from: "PlainFormatter", to: "Formatter", kind: "implements" },
        { from: "JsonFormatter", to: "Formatter", kind: "implements" },
        { from: "ConsoleAppender", to: "Appender", kind: "implements" },
        { from: "FileAppender", to: "Appender", kind: "implements" },
        { from: "NetworkAppender", to: "Appender", kind: "implements" },
        { from: "AsyncAppender", to: "Appender", kind: "implements" },
        { from: "AsyncAppender", to: "Appender", kind: "depends" },
      ],
      patterns: [
        { id: "chain", label: "Chain of Responsibility", classes: ["Logger", "Appender", "ConsoleAppender", "FileAppender", "NetworkAppender"],
          note: "A record is offered to each appender in turn; each decides for itself. Add or remove sinks without touching Logger." },
        { id: "strategy", label: "Strategy", classes: ["Formatter", "PlainFormatter", "JsonFormatter"],
          note: "The format varies independently of the sink. Swap plain ↔ JSON and every sink re-renders the same records." },
        { id: "decorator", label: "Decorator", classes: ["AsyncAppender", "Appender"],
          note: "AsyncAppender wraps a target appender with a bounded queue, so the hot path returns immediately and the worker does the I/O." },
      ],
      strategyGroups: [
        { id: "format", label: "Formatter", options: [
            { id: "plain", label: "Plain", note: "Human-readable: time LEVEL [req] message." },
            { id: "json", label: "JSON", note: "Structured: {\"ts\",\"level\",\"msg\",\"req\"} — machine-parseable." },
          ], default: "plain", classMap: { plain: "PlainFormatter", json: "JsonFormatter" },
          onChange: function (id) { inst.strategy.format = id; inst.lastDecision = "Formatter = " + id + "."; render(inst); } },
        { id: "drop", label: "Queue full", options: [
            { id: "dropOldest", label: "Drop oldest", note: "Keep the hot path non-blocking; the oldest queued record is discarded." },
            { id: "block", label: "Block caller", note: "Apply backpressure: the caller waits for space. Nothing is lost, but latency leaks into the app." },
          ], default: "dropOldest", classMap: { dropOldest: "AsyncAppender", block: "AsyncAppender" },
          onChange: function (id) { inst.strategy.dropPolicy = id; inst.lastDecision = "Queue-full policy = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["Logger", "LogLevel"], note: "Levels, multiple sinks, per-sink thresholds, format, async, correlation id." },
        { n: 2, label: "Core Entities", classes: ["LogRecord", "Appender", "Formatter"], note: "Nouns: logger, record, appender, formatter, filter, config." },
        { n: 3, label: "Responsibilities", classes: ["Logger", "Appender"], note: "Logger routes; each appender owns one sink, its threshold, and its formatter." },
        { n: 4, label: "Relationships + Interfaces", classes: ["Appender", "Formatter", "LevelFilter"], note: "Logger has many appenders; interfaces at sink, format, and filter." },
        { n: 5, label: "Class Diagram", classes: ["Logger", "Appender", "AsyncAppender"], note: "The chain, the formatter strategy, and the async decorator." },
        { n: 6, label: "Core Flows", classes: ["Logger", "AsyncAppender"], note: "Sync: log → appender → write. Async: log → enqueue → worker drain." },
        { n: 7, label: "Critical Code", classes: ["Logger", "AsyncAppender"], note: "The fast level reject and the bounded enqueue/drain carry the design." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["Formatter", "Appender"], note: "Queue full, slow sink, reentrancy, config reload; new sink/format/filter = new implementation." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".logger-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
