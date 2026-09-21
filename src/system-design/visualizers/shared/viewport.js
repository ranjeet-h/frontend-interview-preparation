/* Shared diagram viewport: zoom, pan, fit, fullscreen.
   Prefix: sdv-. Attach to any wrapper that contains an inline <svg>.
   Usage: SDViewport.attach(wrapperEl)  ->  controller | null
   No dependencies. Keeps the diagram usable as it grows. */
(function () {
  "use strict";

  function parseViewBox(s) {
    if (!s) return null;
    var p = s.trim().split(/[\s,]+/).map(Number);
    if (p.length !== 4 || p.some(isNaN)) return null;
    return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }

  function attach(wrapper) {
    var svg = wrapper.querySelector("svg");
    if (!svg || svg.dataset.sdvReady === "true") return null;

    var base = parseViewBox(svg.getAttribute("viewBox")) || {
      x: 0,
      y: 0,
      w: svg.clientWidth || 1000,
      h: svg.clientHeight || 600,
    };
    var vb = { x: base.x, y: base.y, w: base.w, h: base.h };
    var MIN_W = base.w / 12; // max zoom-in
    var MAX_W = base.w * 4; // max zoom-out

    svg.dataset.sdvReady = "true";
    wrapper.classList.add("sdv-wrap");
    svg.classList.add("sdv-svg");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.touchAction = "none";

    // ---- controls ------------------------------------------------------------
    var ctl = document.createElement("div");
    ctl.className = "sdv-ctl";
    ctl.innerHTML =
      '<button type="button" class="sdv-btn" data-act="out" aria-label="Zoom out" title="Zoom out">−</button>' +
      '<button type="button" class="sdv-btn" data-act="fit" aria-label="Fit to view" title="Fit to view">Fit</button>' +
      '<button type="button" class="sdv-btn" data-act="in" aria-label="Zoom in" title="Zoom in">+</button>' +
      '<button type="button" class="sdv-btn" data-act="full" aria-label="Toggle fullscreen" title="Fullscreen">⛶</button>';
    wrapper.appendChild(ctl);

    var hint = document.createElement("div");
    hint.className = "sdv-hint";
    hint.textContent = "scroll / pinch to zoom · drag to pan";
    wrapper.appendChild(hint);

    function apply() {
      svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
    }

    function metrics() {
      var r = svg.getBoundingClientRect();
      var scale = Math.min(r.width / vb.w, r.height / vb.h) || 1;
      return {
        rect: r,
        scale: scale,
        ox: (r.width - vb.w * scale) / 2,
        oy: (r.height - vb.h * scale) / 2,
      };
    }
    function toSvg(clientX, clientY) {
      var m = metrics();
      return {
        x: vb.x + (clientX - m.rect.left - m.ox) / m.scale,
        y: vb.y + (clientY - m.rect.top - m.oy) / m.scale,
      };
    }
    function clamp() {
      var bcx = base.x + base.w / 2;
      var bcy = base.y + base.h / 2;
      var cx = vb.x + vb.w / 2;
      var cy = vb.y + vb.h / 2;
      var limX = base.w * 0.9;
      var limY = base.h * 0.9;
      cx = Math.max(bcx - limX, Math.min(bcx + limX, cx));
      cy = Math.max(bcy - limY, Math.min(bcy + limY, cy));
      vb.x = cx - vb.w / 2;
      vb.y = cy - vb.h / 2;
    }
    function zoomAt(clientX, clientY, factor) {
      var p = toSvg(clientX, clientY);
      var nw = vb.w / factor;
      if (nw < MIN_W || nw > MAX_W) return;
      vb.x = p.x - (p.x - vb.x) / factor;
      vb.y = p.y - (p.y - vb.y) / factor;
      vb.w = nw;
      vb.h = vb.h / factor;
      clamp();
      apply();
    }
    function zoomCenter(factor) {
      var m = metrics();
      zoomAt(m.rect.left + m.rect.width / 2, m.rect.top + m.rect.height / 2, factor);
    }
    function fit() {
      vb = { x: base.x, y: base.y, w: base.w, h: base.h };
      apply();
    }

    // ---- wheel zoom ----------------------------------------------------------
    wrapper.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
      },
      { passive: false }
    );

    // ---- pointer pan + pinch -------------------------------------------------
    var pointers = new Map();
    var panLast = null;
    var pinchDist = 0;
    var panning = false;
    var downAt = null;

    function twoPoints() {
      var it = pointers.values();
      var a = it.next().value;
      var b = it.next().value;
      return [a, b];
    }
    function dist2() {
      var p = twoPoints();
      return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
    function mid2() {
      var p = twoPoints();
      return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    }

    svg.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      if (pointers.size === 1) {
        downAt = { x: e.clientX, y: e.clientY };
        panLast = null;
        panning = false;
      } else if (pointers.size === 2) {
        downAt = null;
        panLast = null;
        panning = false;
        pinchDist = dist2();
      }
      // Do not preventDefault here: a tap/click must still reach diagram buttons.
    });

    svg.addEventListener("pointermove", function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1 && downAt) {
        if (!panning) {
          if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) {
            panning = true;
            panLast = downAt;
            wrapper.classList.add("is-panning");
          }
        }
        if (panning) {
          var m = metrics();
          vb.x -= (e.clientX - panLast.x) / m.scale;
          vb.y -= (e.clientY - panLast.y) / m.scale;
          panLast = { x: e.clientX, y: e.clientY };
          clamp();
          apply();
          e.preventDefault();
        }
      } else if (pointers.size === 2 && pinchDist > 0) {
        var d = dist2();
        var mid = mid2();
        zoomAt(mid.x, mid.y, d / pinchDist);
        pinchDist = d;
        e.preventDefault();
      }
    });

    function onUp(e) {
      pointers.delete(e.pointerId);
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      if (pointers.size === 0) {
        panLast = null;
        downAt = null;
        pinchDist = 0;
        panning = false;
        wrapper.classList.remove("is-panning");
      } else if (pointers.size === 1) {
        var p = pointers.values().next().value;
        downAt = { x: p.x, y: p.y };
        panLast = null;
        panning = false;
        pinchDist = 0;
        wrapper.classList.remove("is-panning");
      }
    }
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);

    svg.addEventListener("dblclick", function (e) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, 1.6);
    });

    // ---- fullscreen ----------------------------------------------------------
    var fullBtn = ctl.querySelector('[data-act="full"]');
    function toggleFull() {
      if (document.fullscreenElement === wrapper) {
        document.exitFullscreen();
      } else if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen().then(function () {
          setTimeout(fit, 60);
        }).catch(function () {});
      } else {
        wrapper.classList.toggle("sdv-fallback-full");
        setTimeout(fit, 60);
      }
    }
    fullBtn.addEventListener("click", toggleFull);

    function sync() {
      fullBtn.textContent = document.fullscreenElement === wrapper ? "⤢" : "⛶";
      fullBtn.setAttribute("aria-label", document.fullscreenElement === wrapper ? "Exit fullscreen" : "Fullscreen");
      hint.style.display = document.fullscreenElement === wrapper ? "" : "";
    }
    document.addEventListener("fullscreenchange", sync);

    ctl.querySelector('[data-act="in"]').addEventListener("click", function () { zoomCenter(1.25); });
    ctl.querySelector('[data-act="out"]').addEventListener("click", function () { zoomCenter(0.8); });
    ctl.querySelector('[data-act="fit"]').addEventListener("click", fit);

    apply();
    return { fit: fit, zoomIn: function () { zoomCenter(1.25); }, zoomOut: function () { zoomCenter(0.8); }, toggleFullscreen: toggleFull };
  }

  window.SDViewport = { attach: attach };
})();
