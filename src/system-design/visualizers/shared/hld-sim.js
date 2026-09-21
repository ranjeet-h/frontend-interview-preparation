/* Shared HLD load & scale simulator. Prefix: hld-.
   Config-driven: renders a service topology, models traffic -> load -> bottleneck,
   and offers one "Scale up" action with a what-failed / what-changed / what-improved panel.
   Usage: SDHLDSim.attach(container, config) */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }
  function pct(u) { if (u == null) return "–"; if (!isFinite(u)) return "∞"; return Math.round(u * 100) + "%"; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function level(u, target) { if (u == null) return "ok"; if (u >= 1) return "danger"; if (u >= (target || 0.7)) return "warn"; return "ok"; }

  function attach(container, config) {
    container.classList.add("hld");
    var nodes = config.nodes || [];
    var edges = config.edges || [];
    var target = config.target || 0.7;
    var byId = {};
    var maxX = 0, maxY = 0;
    nodes.forEach(function (n) {
      n.w = n.w || 148; n.h = n.h || 58;
      n.count = n.count == null ? (n.min || 1) : n.count;
      byId[n.id] = n;
      maxX = Math.max(maxX, n.x + n.w / 2 + 20);
      maxY = Math.max(maxY, n.y + n.h / 2 + 20);
    });
    var VW = Math.max(maxX, 600), VH = Math.max(maxY, 320);

    var state = { traffic: config.traffic.default || 0 };
    nodes.forEach(function (n) { state[n.id] = n.count; });

    function geo(e) {
      var a = byId[e.from], b = byId[e.to];
      var p0 = { x: a.x, y: a.y }, p2 = { x: b.x, y: b.y };
      var c = e.control ? { x: e.control.x, y: e.control.y } : { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
      return { p0: p0, c: c, p2: p2 };
    }
    function qp(g, t) { var mt = 1 - t; return { x: mt * mt * g.p0.x + 2 * mt * t * g.c.x + t * t * g.p2.x, y: mt * mt * g.p0.y + 2 * mt * t * g.c.y + t * t * g.p2.y }; }
    function pathD(g) { return "M " + g.p0.x + " " + g.p0.y + " Q " + g.c.x + " " + g.c.y + " " + g.p2.x + " " + g.p2.y; }

    // ---- markup --------------------------------------------------------------
    var trafficOpts = config.traffic.options.map(function (o, i) {
      return '<option value="' + i + '"' + (i === config.traffic.default ? " selected" : "") + ">" + o.label + "</option>";
    }).join("");

    var edgesSvg = edges.map(function (e) {
      var g = geo(e);
      var lab = qp(g, 0.5);
      return '<path class="hld-edge is-' + (e.kind || "flow") + '" id="' + container.id + '-e-' + e.from + "-" + e.to + '" d="' + pathD(g) + '"></path>' +
        '<text class="hld-elabel" x="' + lab.x.toFixed(1) + '" y="' + lab.y.toFixed(1) + '" text-anchor="middle" data-elabel="' + e.from + "-" + e.to + '"></text>';
    }).join("");

    var nodesSvg = nodes.map(function (n) {
      return '<g class="hld-node is-' + (n.kind || "service") + '" data-node="' + n.id + '" transform="translate(' + n.x + "," + n.y + ')">' +
        '<rect class="hld-box" x="' + (-n.w / 2) + '" y="' + (-n.h / 2) + '" width="' + n.w + '" height="' + n.h + '" rx="12"></rect>' +
        '<text class="hld-title" x="0" y="-10" text-anchor="middle">' + (n.icon ? n.icon + " " : "") + n.label + "</text>" +
        '<text class="hld-sub" x="0" y="9" text-anchor="middle" data-sub></text>' +
        '<rect class="hld-bar-bg" x="-50" y="20" width="100" height="6" rx="3"></rect>' +
        '<rect class="hld-bar-fill" x="-50" y="20" width="0" height="6" rx="3" data-bar></rect>' +
        "</g>";
    }).join("");

    container.innerHTML =
      '<div class="hld-toolbar">' +
      '<label class="hld-field"><span class="hld-field-label">' + (config.traffic.label || "Traffic") + '</span>' +
      '<select class="hld-select hld-traffic" aria-label="Traffic">' + trafficOpts + "</select></label>" +
      '<button type="button" class="hld-btn hld-primary hld-scale">Scale up</button>' +
      '<span class="hld-hint-inline" aria-live="polite"></span>' +
      '<button type="button" class="hld-btn hld-reset">Reset</button>' +
      "</div>" +
      '<div class="hld-stage" data-viewport><svg class="hld-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="' + (config.aria || "Architecture") + '">' +
      '<g class="hld-edges">' + edgesSvg + "</g><g class=\"hld-dots\"></g><g class=\"hld-nodes\">" + nodesSvg + "</g></svg></div>" +
      '<div class="hld-metrics"></div>' +
      '<div class="hld-narration" role="status" aria-live="polite"></div>' +
      '<dl class="hld-explain" aria-live="polite"></dl>' +
      '<p class="hld-hint">' + (config.note || "") + "</p>";

    var inst = { container: container, model: null, dots: [], prev: {}, lastFix: null, timer: null, reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches };

    container.querySelector(".hld-traffic").addEventListener("change", function (e) {
      state.traffic = parseInt(e.target.value, 10);
      inst.lastFix = null;
      render();
    });
    container.querySelector(".hld-scale").addEventListener("click", scaleUp);
    container.querySelector(".hld-reset").addEventListener("click", function () {
      nodes.forEach(function (n) { state[n.id] = n.count0 == null ? (n.min || 1) : n.count0; });
      state.traffic = config.traffic.default || 0;
      container.querySelector(".hld-traffic").value = String(config.traffic.default || 0);
      inst.lastFix = null;
      render();
    });
    nodes.forEach(function (n) { n.count0 = n.count; });

    function compute() {
      return config.compute(state, config.traffic.options[state.traffic].value, { fmt: fmt, pct: pct, clamp: clamp, level: level, target: target });
    }

    function scaleUp() {
      var m = compute();
      var b = m.bottleneck;
      if (!b) return;
      var before = m, beforeCount = state[b];
      var need = Math.max(beforeCount + 1, (m.required && m.required[b]) || beforeCount + 1);
      state[b] = need;
      var after = compute();
      inst.lastFix = { key: b, added: need - beforeCount, before: before, after: after };
      render(b);
    }

    function render(bumped) {
      var m = compute();
      inst.model = m;
      var c = container;

      nodes.forEach(function (n) {
        var count = state[n.id];
        var load = m.load[n.id] == null ? 0 : m.load[n.id];
        var util = n.capacity ? load / (count * n.capacity) : null;
        var lvl = level(util, target);
        var g = c.querySelector('[data-node="' + n.id + '"]');
        if (!g) return;
        g.classList.toggle("is-warn", lvl === "warn");
        g.classList.toggle("is-danger", lvl === "danger");
        g.style.display = (n.hideWhenZero && count === 0) ? "none" : "";
        g.querySelector("[data-sub]").textContent = m.nodeSub && m.nodeSub[n.id] != null ? m.nodeSub[n.id] : (n.capacity ? "×" + count + " · " + pct(util) : fmt(load) + " " + (n.unit || "rps"));
        var bar = g.querySelector("[data-bar]");
        if (bar) bar.setAttribute("width", (util == null ? 0 : clamp(util, 0, 1) * 100).toFixed(1));
      });

      edges.forEach(function (e) {
        var flow = (m.edgeFlow && m.edgeFlow[e.from + "-" + e.to]) || 0;
        var el = c.querySelector('[data-elabel="' + e.from + "-" + e.to + '"]');
        if (el) el.textContent = e.label ? (typeof e.label === "function" ? e.label(flow, m) : e.label) : (flow > 0 ? fmt(flow) : "");
        var path = c.querySelector("#" + container.id + "-e-" + e.from + "-" + e.to);
        if (path) {
          var danger = (m.load[e.from] != null && byId[e.from].capacity && m.load[e.from] / (state[e.from] * byId[e.from].capacity) >= 1) ||
            (m.load[e.to] != null && byId[e.to].capacity && m.load[e.to] / (state[e.to] * byId[e.to].capacity) >= 1);
          path.classList.toggle("is-danger", !!danger);
        }
      });

      c.querySelector(".hld-metrics").innerHTML = m.metrics.map(function (x) {
        return '<div class="hld-metric' + (x.level && x.level !== "ok" ? " is-" + x.level : "") + '"><span class="hld-metric-label">' + x.label + '</span><span class="hld-metric-value">' + x.value + "</span></div>";
      }).join("");

      var nar = c.querySelector(".hld-narration");
      nar.className = "hld-narration is-" + m.narration.cls;
      nar.innerHTML = m.narration.text;

      var fix = m.bottleneck;
      var btn = c.querySelector(".hld-scale");
      var hint = c.querySelector(".hld-hint-inline");
      if (fix) {
        var need = Math.max(1, ((m.required && m.required[fix]) || state[fix] + 1) - state[fix]);
        btn.disabled = false;
        btn.textContent = "Scale up";
        hint.textContent = "→ " + need + " " + (byId[fix].scaleLabel || "unit") + (need === 1 ? "" : "s");
        hint.className = "hld-hint-inline is-" + level(m.load[fix] / (state[fix] * byId[fix].capacity), target);
      } else {
        btn.disabled = true;
        btn.textContent = "System healthy";
        hint.textContent = "increase traffic to stress it";
        hint.className = "hld-hint-inline is-ok";
      }

      c.querySelector(".hld-explain").innerHTML = explain(m, fix);

      // bump animation
      var prev = inst.prev || {};
      if (bumped) {
        var before = prev[bumped] == null ? state[bumped] : prev[bumped];
        var delta = state[bumped] - before;
        var g2 = c.querySelector('[data-node="' + bumped + '"]');
        if (g2 && delta > 0) {
          g2.classList.remove("is-new"); void g2.getBoundingClientRect(); g2.classList.add("is-new");
          var plus = g2.querySelector("[data-plus]");
          if (!plus) { plus = document.createElementNS(NS, "text"); plus.setAttribute("class", "hld-plus"); plus.setAttribute("text-anchor", "middle"); plus.setAttribute("y", -40); plus.setAttribute("data-plus", ""); g2.appendChild(plus); }
          plus.textContent = "+" + delta;
          setTimeout(function () { g2.classList.remove("is-new"); }, 900);
        }
      }
      inst.prev = {};
      nodes.forEach(function (n) { inst.prev[n.id] = state[n.id]; });

      rebuildDots(m);
    }

    function explain(m, fix) {
      var f = inst.lastFix;
      function row(t, d) { return '<div class="hld-row"><dt>' + t + "</dt><dd>" + d + "</dd></div>"; }
      if (f) {
        var n = byId[f.key];
        var beforeCount = state[f.key] - f.added;
        var bu2 = f.before.load[f.key] / (beforeCount * n.capacity);
        var au = f.after.load[f.key] / (state[f.key] * n.capacity);
        return row("Was failing", "<strong>" + n.label + "</strong> at " + pct(bu2) + " — " + (n.fail || "it was the bottleneck.")) +
          row("What we changed", "Added " + f.added + " " + (n.scaleLabel || "unit") + (f.added === 1 ? "" : "s") + " (" + beforeCount + " → " + state[f.key] + ").") +
          row("What improved", n.label + " load " + pct(bu2) + " → " + pct(au) + ".") +
          row("Why it helps", n.why || "") +
          (f.after.bottleneck ? row("Next", byId[f.after.bottleneck].label + " is now the bottleneck at " + pct(f.after.load[f.after.bottleneck] / (state[f.after.bottleneck] * byId[f.after.bottleneck].capacity)) + ".") : row("Result", "✅ System healthy — increase traffic to stress it again."));
      }
      if (fix) {
        var n2 = byId[fix];
        return row("What's failing", "<strong>" + n2.label + "</strong> at " + pct(m.load[fix] / (state[fix] * n2.capacity)) + " — " + (n2.fail || "it is the bottleneck.")) +
          row("Why", n2.why || "") +
          row("Do this", "Press <strong>Scale up</strong> to add capacity.");
      }
      return row("Status", "🟢 Healthy. Increase <strong>" + (config.traffic.label || "Traffic") + "</strong> until something turns red, then press <strong>Scale up</strong>.");
    }

    function rebuildDots(m) {
      var layer = container.querySelector(".hld-dots");
      inst.dots = [];
      if (inst.reduced) { layer.innerHTML = ""; return; }
      layer.innerHTML = "";
      var flows = edges.map(function (e) { return (m.edgeFlow && m.edgeFlow[e.from + "-" + e.to]) || 0; });
      var maxF = Math.max.apply(null, flows.concat([1]));
      edges.forEach(function (e, i) {
        var flow = flows[i];
        var count = clamp(Math.round((flow / maxF) * 5), flow > 0 ? 1 : 0, 5);
        var g = geo(e);
        for (var k = 0; k < count; k++) {
          var circle = document.createElementNS(NS, "circle");
          circle.setAttribute("r", "4"); circle.setAttribute("class", "hld-dot is-" + (e.kind || "flow"));
          layer.appendChild(circle);
          inst.dots.push({ el: circle, geo: g, t: Math.random(), speed: 0.18 + 0.9 * (flow / maxF) });
        }
      });
    }

    if (window.SDViewport) window.SDViewport.attach(container.querySelector(".hld-stage"));
    render();

    if (!inst.reduced) {
      var last = performance.now();
      (function frame(now) {
        var dt = Math.min(0.05, (now - last) / 1000); last = now;
        for (var i = 0; i < inst.dots.length; i++) {
          var d = inst.dots[i]; d.t += d.speed * dt; if (d.t > 1) d.t -= 1;
          var p = qp(d.geo, d.t); d.el.setAttribute("cx", p.x); d.el.setAttribute("cy", p.y);
        }
        inst.timer = requestAnimationFrame(frame);
      })(last);
    }
    return { render: render };
  }

  window.SDHLDSim = { attach: attach };
})();
