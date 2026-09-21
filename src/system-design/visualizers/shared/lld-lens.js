/* Shared LLD design lens. Prefix: lll-.
   Teaches the OBJECT MODEL behind a visualizer: class graph, responsibilities,
   design patterns, swappable strategies, a live call trace, and a map from the
   LLD interview path to the live evidence.

   Usage:
     var lens = SDLLDLens.attach(container, {
       classes: [{ id, label, stereotype, x, y, fields[], methods[], owns, invariant }],
       edges:   [{ from, to, kind }],   // composition|aggregation|association|implements|inheritance|depends
       patterns:[{ id, label, classes[], note }],
       strategyGroups: [{
         id, label,
         options: [{ id, label, note }],
         default, classMap: { optionId: classId },
         onChange: function (optionId) {}
       }],
       interview:[{ n, label, classes[], note }],
       interviewLabel: "Interview map",
       // Backwards-compatible single group:
       strategies, strategyClasses, defaultStrategy, onStrategyChange
     });
   API: lens.setActive([ids]) | lens.setTrace([{cls,method}]) |
        lens.setPattern(id|null) | lens.setInterview(n|null) | lens.setStrategy(groupId, optionId)
*/
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function attach(container, config) {
    container.classList.add("lll");
    var classes = config.classes || [];
    var edges = config.edges || [];
    var byId = {};
    var maxX = 0, maxY = 0;

    classes.forEach(function (c) {
      c.w = c.w || 150;
      c.h = c.h || 62;
      byId[c.id] = c;
      maxX = Math.max(maxX, c.x + c.w / 2 + 20);
      maxY = Math.max(maxY, c.y + c.h / 2 + 20);
    });
    var VW = maxX, VH = maxY;

    // normalize strategy groups (support the older flat single-group shape too)
    var groups = config.strategyGroups || (config.strategies
      ? [{ id: "policy", label: "Policy", options: config.strategies, default: config.defaultStrategy, classMap: config.strategyClasses, onChange: config.onStrategyChange }]
      : []);

    function boundary(a, tx, ty) {
      var hw = a.w / 2, hh = a.h / 2;
      var dx = tx - a.x, dy = ty - a.y;
      var sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
      var sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
      var s = Math.min(sx, sy);
      return { x: a.x + dx * s, y: a.y + dy * s };
    }
    function poly(points, cls, dataEdge) {
      var d = dataEdge ? ' data-edge="' + dataEdge + '"' : "";
      return '<polygon class="' + cls + '"' + d + ' points="' + points.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"></polygon>';
    }
    function diamond(x, y, ang) {
      var L = 16, W = 9, dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      return [[x, y], [x + dx * L / 2 + px * W / 2, y + dy * L / 2 + py * W / 2], [x + dx * L, y + dy * L], [x + dx * L / 2 - px * W / 2, y + dy * L / 2 - py * W / 2]];
    }
    function triangle(x, y, ang) {
      var L = 12, W = 9, dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      return [[x, y], [x - dx * L + px * W / 2, y - dy * L + py * W / 2], [x - dx * L - px * W / 2, y - dy * L - py * W / 2]];
    }

    var edgesSvg = edges.map(function (e) {
      var a = byId[e.from], b = byId[e.to];
      if (!a || !b) return "";
      var p1 = boundary(a, b.x, b.y);
      var p2 = boundary(b, a.x, a.y);
      var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      var dashed = e.kind === "implements" || e.kind === "depends";
      var s = '<line class="lll-edge' + (dashed ? " is-dashed" : "") + '" data-edge="' + e.from + "-" + e.to + '" x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '"></line>';
      if (e.kind === "composition") s += poly(diamond(p1.x, p1.y, ang), "lll-mark lll-fill", e.from + "-" + e.to);
      if (e.kind === "aggregation") s += poly(diamond(p1.x, p1.y, ang), "lll-mark lll-hollow", e.from + "-" + e.to);
      if (e.kind === "implements" || e.kind === "inheritance" || e.kind === "depends") s += poly(triangle(p2.x, p2.y, ang), "lll-mark lll-hollow", e.from + "-" + e.to);
      return s;
    }).join("");

    var nodesSvg = classes.map(function (c) {
      var stereo = c.stereotype ? c.stereotype : "class";
      return (
        '<g class="lll-node is-' + stereo + '" data-class="' + c.id + '" transform="translate(' + c.x + "," + c.y + ')">' +
        '<rect class="lll-box" x="' + (-c.w / 2) + '" y="' + (-c.h / 2) + '" width="' + c.w + '" height="' + c.h + '" rx="9"></rect>' +
        '<text class="lll-stereo" x="0" y="-12" text-anchor="middle">«' + stereo + '»</text>' +
        '<text class="lll-name" x="0" y="9" text-anchor="middle">' + c.label + "</text>" +
        "</g>"
      );
    }).join("");

    var patternChips = (config.patterns || []).map(function (p) {
      return '<button type="button" class="lll-chip" data-pattern="' + p.id + '">' + p.label + "</button>";
    }).join("");

    var strategyHtml = groups.map(function (g) {
      var chips = g.options.map(function (o) {
        return '<button type="button" class="lll-chip" data-group="' + g.id + '" data-option="' + o.id + '">' + o.label + "</button>";
      }).join("");
      return '<div class="lll-group"><span class="lll-group-label">' + g.label + "</span>" + chips + "</div>";
    }).join("");

    var interviewChips = (config.interview || []).map(function (q) {
      return '<button type="button" class="lll-chip" data-interview="' + q.n + '" title="' + q.label + '">' + q.n + "</button>";
    }).join("");

    container.innerHTML =
      '<div class="lll-title">LLD design lens — the object model behind the animation</div>' +
      '<div class="lll-controls">' +
      (patternChips ? '<div class="lll-group"><span class="lll-group-label">Patterns</span>' + patternChips + "</div>" : "") +
      strategyHtml +
      "</div>" +
      '<div class="lll-body">' +
      '<div class="lll-stage" data-viewport><svg class="lll-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Class model">' + edgesSvg + nodesSvg + "</svg></div>" +
      '<aside class="lll-detail" aria-live="polite"></aside>' +
      "</div>" +
      '<div class="lll-trace" aria-live="polite"></div>' +
      (interviewChips ? '<div class="lll-interview"><span class="lll-group-label">' + (config.interviewLabel || "Interview map") + "</span>" + interviewChips + "</div>" : "") +
      '<div class="lll-note"></div>';

    var root = container;
    var detail = container.querySelector(".lll-detail");
    var noteEl = container.querySelector(".lll-note");
    var traceEl = container.querySelector(".lll-trace");
    var svg = container.querySelector(".lll-svg");

    function nodeEl(id) { return svg.querySelector('[data-class="' + id + '"]'); }
    function edgeEl(from, to) { return svg.querySelector('[data-edge="' + from + "-" + to + '"]'); }
    function clearFocus() {
      root.classList.remove("is-focus");
      svg.querySelectorAll(".is-hi").forEach(function (n) { n.classList.remove("is-hi"); });
    }
    function focusClasses(ids) {
      clearFocus();
      root.classList.add("is-focus");
      ids.forEach(function (id) { if (nodeEl(id)) nodeEl(id).classList.add("is-hi"); });
      edges.forEach(function (e) {
        if (ids.indexOf(e.from) !== -1 && ids.indexOf(e.to) !== -1) {
          var el = edgeEl(e.from, e.to);
          if (el) el.classList.add("is-hi");
        }
      });
    }

    function showClass(id) {
      var c = byId[id];
      if (!c) return;
      detail.innerHTML =
        "<h4>" + c.label + "</h4>" +
        '<div class="lll-stereo">«' + (c.stereotype || "class") + "»</div>" +
        (c.owns ? "<dl><dt>Owns / responsibility</dt><dd>" + c.owns + "</dd>" : "") +
        (c.invariant ? "<dt>Invariant</dt><dd>" + c.invariant + "</dd></dl>" : "") +
        (c.fields && c.fields.length ? "<dl><dt>Fields</dt><dd>" + c.fields.map(function (f) { return "<code>" + f + "</code>"; }).join(", ") + "</dd></dl>" : "") +
        (c.methods && c.methods.length ? "<dl><dt>Key operations</dt><dd>" + c.methods.map(function (m) { return "<code>" + m + "</code>"; }).join(", ") + "</dd></dl>" : "");
    }
    svg.addEventListener("click", function (e) {
      var g = e.target.closest ? e.target.closest(".lll-node") : null;
      if (g) showClass(g.getAttribute("data-class"));
    });

    // ---- patterns ------------------------------------------------------------
    var currentPattern = null;
    function setPattern(id) {
      currentPattern = id;
      container.querySelectorAll("[data-pattern]").forEach(function (b) {
        b.classList.toggle("is-on", b.getAttribute("data-pattern") === id);
      });
      if (!id) { clearFocus(); noteEl.className = "lll-note"; noteEl.textContent = ""; return; }
      var p = (config.patterns || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      focusClasses(p.classes);
      noteEl.className = "lll-note is-on";
      noteEl.innerHTML = "<b>" + p.label + ".</b> " + p.note;
    }
    container.querySelectorAll("[data-pattern]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-pattern");
        setPattern(currentPattern === id ? null : id);
      });
    });

    // ---- strategy groups (multiple independent swaps) ------------------------
    var selected = {};
    var stratActive = {};
    groups.forEach(function (g) { selected[g.id] = g.default || (g.options[0] && g.options[0].id); });

    function refreshStrategyHighlight() {
      svg.querySelectorAll(".lll-node.is-strategy").forEach(function (n) { n.classList.remove("is-strategy"); });
      Object.keys(stratActive).forEach(function (gid) {
        var cid = stratActive[gid];
        if (cid && nodeEl(cid)) nodeEl(cid).classList.add("is-strategy");
      });
    }
    function setStrategy(groupId, optionId) {
      // backwards compatible: setStrategy(optionId) on the first group
      if (groupId && !groups.some(function (g) { return g.id === groupId; })) {
        optionId = groupId;
        groupId = groups[0] && groups[0].id;
      }
      var g = groups.filter(function (x) { return x.id === groupId; })[0];
      if (!g) return;
      selected[g.id] = optionId;
      container.querySelectorAll('[data-group="' + g.id + '"]').forEach(function (b) {
        b.classList.toggle("is-on", b.getAttribute("data-option") === optionId);
      });
      var cls = g.classMap && g.classMap[optionId];
      stratActive[g.id] = cls || null;
      refreshStrategyHighlight();
      var opt = g.options.filter(function (o) { return o.id === optionId; })[0];
      if (opt) { noteEl.className = "lll-note is-on"; noteEl.innerHTML = "<b>" + opt.label + ".</b> " + opt.note; }
      if (typeof g.onChange === "function") g.onChange(optionId);
    }
    container.querySelectorAll("[data-option]").forEach(function (btn) {
      btn.addEventListener("click", function () { setStrategy(btn.getAttribute("data-group"), btn.getAttribute("data-option")); });
    });

    // ---- interview map -------------------------------------------------------
    var currentQ = null;
    function setInterview(n) {
      currentQ = n;
      container.querySelectorAll("[data-interview]").forEach(function (b) {
        b.classList.toggle("is-on", parseInt(b.getAttribute("data-interview"), 10) === n);
      });
      if (n == null) { clearFocus(); noteEl.className = "lll-note"; noteEl.textContent = ""; return; }
      var q = (config.interview || []).filter(function (x) { return x.n === n; })[0];
      if (!q) return;
      focusClasses(q.classes);
      noteEl.className = "lll-note is-on";
      noteEl.innerHTML = "<b>" + q.n + ". " + q.label + ".</b> " + q.note + " <em>(highlighted classes are your evidence)</em>";
    }
    container.querySelectorAll("[data-interview]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var n = parseInt(btn.getAttribute("data-interview"), 10);
        setInterview(currentQ === n ? null : n);
      });
    });

    // ---- runtime API ---------------------------------------------------------
    function setActive(ids) {
      svg.querySelectorAll(".lll-node.is-active").forEach(function (n) { n.classList.remove("is-active"); });
      (ids || []).forEach(function (id) { if (nodeEl(id)) nodeEl(id).classList.add("is-active"); });
    }
    function setTrace(steps) {
      if (!steps || !steps.length) { traceEl.innerHTML = ""; return; }
      traceEl.innerHTML = steps.map(function (s, i) {
        var chip = '<span class="lll-step' + (i === steps.length - 1 ? " is-on" : "") + '"><code>' + s.cls + "." + s.method + "()</code></span>";
        return (i ? '<span class="lll-arrow">→</span>' : "") + chip;
      }).join("");
    }

    if (window.SDViewport) window.SDViewport.attach(container.querySelector(".lll-stage"));
    showClass(classes[0] && classes[0].id);
    groups.forEach(function (g) { setStrategy(g.id, selected[g.id]); });

    return {
      setActive: setActive,
      setTrace: setTrace,
      setPattern: setPattern,
      setInterview: setInterview,
      setStrategy: setStrategy,
      getStrategy: function (groupId) {
        var g = groupId || (groups[0] && groups[0].id);
        return selected[g];
      },
    };
  }

  window.SDLLDLens = { attach: attach };
})();
