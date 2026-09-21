/* Notification System (LLD) visualizer: preferences, templates, channel fan-out,
   retries, dedup, with the shared LLD design lens. Prefix: ntv-. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  var CHANNELS = ["email", "sms", "push"];
  var CH_LABEL = { email: "Email", sms: "SMS", push: "Push" };
  var SUCCESS = { email: 0.9, sms: 0.8, push: 0.95 };
  var TYPES = ["order_shipped", "payment_failed", "promo"];
  var USERS = [
    { name: "Alice", prefs: { email: true, sms: false, push: true } },
    { name: "Bob", prefs: { email: true, sms: true, push: false } },
  ];
  var VW = 900, VH = 240, NW = 128, NH = 50;

  var NODES = {
    service: { x: 90, y: 120, label: "Notification", sub: "service" },
    prefs: { x: 300, y: 120, label: "Preferences", sub: "eligible channels" },
    template: { x: 510, y: 120, label: "TemplateEngine", sub: "render per channel" },
    email: { x: 730, y: 50, label: "Email", sub: "adapter" },
    sms: { x: 730, y: 120, label: "SMS", sub: "adapter" },
    push: { x: 730, y: 190, label: "Push", sub: "adapter" },
  };
  var EDGES = [["service", "prefs"], ["prefs", "template"], ["template", "email"], ["template", "sms"], ["template", "push"]];

  function build(container) {
    var uid = "ntv" + build.count;
    build.count += 1;
    container.classList.add("ntv");

    var inst = {
      uid: uid,
      container: container,
      results: {}, // channel -> {status, attempts}
      dedup: {},
      seq: 0,
      lastKey: null,
      sent: 0, failed: 0, retried: 0, deduped: 0, skipped: 0,
      speed: 1,
      timer: null,
      strategy: { channelPolicy: "respect", retry: "exponential" },
      lens: null,
      lastDecision: "Pick a recipient and type, then Send. Opted-out channels are skipped; duplicates are deduped.",
      bad: false,
    };
    CHANNELS.forEach(function (c) { inst.results[c] = { status: "idle", attempts: 0 }; });

    var nodesSvg = Object.keys(NODES).map(function (k) {
      var n = NODES[k];
      return '<g class="ntv-node" data-node="' + k + '" transform="translate(' + n.x + "," + n.y + ')">' +
        '<rect class="ntv-box" x="' + (-NW / 2) + '" y="' + (-NH / 2) + '" width="' + NW + '" height="' + NH + '" rx="10"></rect>' +
        '<text class="ntv-label" x="0" y="-2" text-anchor="middle">' + n.label + "</text>" +
        '<text class="ntv-sub" x="0" y="14" text-anchor="middle">' + n.sub + "</text></g>";
    }).join("");
    var edgesSvg = EDGES.map(function (e) {
      var a = NODES[e[0]], b = NODES[e[1]];
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      var sx = a.x + ux * (NW / 2), sy = a.y + uy * (NH / 2), ex = b.x - ux * (NW / 2 + 10), ey = b.y - uy * (NH / 2 + 10);
      var ang = Math.atan2(ey - sy, ex - sx), L = 10, W = 7, px = -Math.sin(ang), py = Math.cos(ang), cx2 = Math.cos(ang), cy2 = Math.sin(ang);
      var arrow = [[ex, ey], [ex - cx2 * L + px * W / 2, ey - cy2 * L + py * W / 2], [ex - cx2 * L - px * W / 2, ey - cy2 * L - py * W / 2]];
      return '<line class="ntv-edge" x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '"></line>' +
        '<polygon class="ntv-arrow" points="' + arrow.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"></polygon>';
    }).join("");

    var userOpts = USERS.map(function (u, i) { return '<option value="' + i + '">' + u.name + "</option>"; }).join("");
    var typeOpts = TYPES.map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("");

    container.innerHTML =
      '<div class="ntv-toolbar">' +
      '<button type="button" class="ntv-btn ntv-primary ntv-play">▶ Play</button>' +
      '<button type="button" class="ntv-btn ntv-primary ntv-send">Send</button>' +
      '<button type="button" class="ntv-btn ntv-resend">Resend last</button>' +
      '<button type="button" class="ntv-btn ntv-reset">Reset</button>' +
      '<span class="ntv-sep"></span>' +
      '<label class="ntv-field">Recipient <select class="ntv-select ntv-user">' + userOpts + "</select></label>" +
      '<label class="ntv-field">Type <select class="ntv-select ntv-type">' + typeOpts + "</select></label>" +
      "</div>" +
      '<div class="ntv-stage"><svg class="ntv-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Notification pipeline">' + edgesSvg + nodesSvg + "</svg></div>" +
      '<div class="ntv-cards">' +
      CHANNELS.map(function (c) {
        return '<div class="ntv-card"><div class="ntv-card-head">' + CH_LABEL[c] + '</div><div class="ntv-status" data-status="' + c + '">idle</div><div class="ntv-card-sub" data-sub="' + c + '"></div></div>';
      }).join("") +
      "</div>" +
      '<div class="ntv-prefs" data-prefs></div>' +
      '<div class="ntv-caption" role="status" aria-live="polite"></div>' +
      '<div class="ntv-metrics">' +
      metric("Sent", "sent") + metric("Failed", "failed") + metric("Retried", "retried") + metric("Deduped", "deduped") + metric("Skipped", "skipped") +
      "</div>" +
      '<div class="ntv-lens" data-lens></div>' +
      '<p class="ntv-hint">Invariant: a channel the user opted out of is <b>never</b> used, and at most one successful delivery per <b>(notification, channel)</b> — retries reuse the same idempotency key.</p>';

    container.querySelector(".ntv-send").addEventListener("click", function () {
      send(inst, parseInt(container.querySelector(".ntv-user").value, 10), container.querySelector(".ntv-type").value, false);
    });
    container.querySelector(".ntv-resend").addEventListener("click", function () {
      send(inst, parseInt(container.querySelector(".ntv-user").value, 10), container.querySelector(".ntv-type").value, true);
    });
    container.querySelector(".ntv-user").addEventListener("change", function () { render(inst); });
    container.querySelector(".ntv-play").addEventListener("click", function () { togglePlay(inst); });
    container.querySelector(".ntv-reset").addEventListener("click", function () { reset(inst); });

    if (window.SDLLDLens) inst.lens = window.SDLLDLens.attach(container.querySelector("[data-lens]"), lensConfig(inst));
    render(inst);
  }
  build.count = 0;

  function metric(label, key) {
    return '<div class="ntv-metric"><span class="ntv-metric-label">' + label + '</span><span class="ntv-metric-value" data-metric="' + key + '">–</span></div>';
  }

  function eligible(inst, userIdx, type) {
    var u = USERS[userIdx];
    if (inst.strategy.channelPolicy === "force") return CHANNELS.slice(); // unsafe: ignores opt-out
    return CHANNELS.filter(function (c) { return u.prefs[c]; });
  }

  function send(inst, userIdx, type, reuse) {
    var u = USERS[userIdx];
    var key;
    if (reuse && inst.lastKey) { key = inst.lastKey; }
    else { inst.seq += 1; key = "n" + inst.seq + ":" + userIdx + ":" + type; inst.lastKey = key; }

    if (inst.dedup[key]) {
      inst.deduped += 1;
      inst.bad = true;
      CHANNELS.forEach(function (c) { inst.results[c] = { status: "deduped", attempts: 0 }; });
      inst.lastDecision = "DeduplicationStore.seen(" + key + ") = true → DEDUPED. The same event does not send twice.";
      flash(inst, ["service"]);
      trace(inst, ["DeduplicationStore"], [
        { cls: "NotificationService", method: "send" },
        { cls: "DeduplicationStore", method: "seen" },
      ]);
      render(inst); return;
    }
    inst.dedup[key] = true;

    var chans = eligible(inst, userIdx, type);
    inst.bad = false;
    var summary = [];

    CHANNELS.forEach(function (c) {
      if (chans.indexOf(c) === -1) {
        inst.results[c] = { status: "skipped", attempts: 0 };
        inst.skipped += 1;
        summary.push(CH_LABEL[c] + ": skipped (opt-out)");
        return;
      }
      var attempts = 0, ok = false, retried = 0;
      var maxRetries = inst.strategy.retry === "exponential" ? 2 : 0;
      while (true) {
        attempts += 1;
        ok = Math.random() < SUCCESS[c];
        if (ok || attempts > maxRetries) break;
        retried += 1; inst.retried += 1;
      }
      if (ok) { inst.results[c] = { status: "sent", attempts: attempts }; inst.sent += 1; summary.push(CH_LABEL[c] + ": sent" + (attempts > 1 ? " (after " + (attempts - 1) + " retry)" : "")); }
      else { inst.results[c] = { status: "failed", attempts: attempts }; inst.failed += 1; summary.push(CH_LABEL[c] + ": FAILED after " + attempts + " attempt(s)"); }
    });

    inst.lastDecision = "send(" + u.name + ", " + type + ") → " + summary.join(" · ") + ".";
    flash(inst, ["service", "prefs", "template"]);
    trace(inst, ["ChannelAdapter", "TemplateEngine", "UserPreferences"], [
      { cls: "NotificationService", method: "send" },
      { cls: "UserPreferences", method: "eligible" },
      { cls: "TemplateEngine", method: "render" },
      { cls: "ChannelAdapter", method: "send" },
    ]);
    render(inst);
  }

  function flash(inst, keys) {
    keys.forEach(function (k) {
      var el = inst.container.querySelector('[data-node="' + k + '"]');
      if (!el) return;
      el.classList.add("is-active");
      setTimeout(function () { el.classList.remove("is-active"); }, 400);
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
    send(inst, Math.floor(Math.random() * USERS.length), TYPES[Math.floor(Math.random() * TYPES.length)], false);
  }
  function play(inst) {
    if (inst.timer) return;
    var b = inst.container.querySelector(".ntv-play");
    if (b) b.textContent = "⏸ Pause";
    inst.timer = setInterval(function () { tick(inst); }, 1000 / inst.speed);
  }
  function pause(inst) {
    if (inst.timer) { clearInterval(inst.timer); inst.timer = null; }
    var b = inst.container.querySelector(".ntv-play");
    if (b) b.textContent = "▶ Play";
  }
  function togglePlay(inst) { if (inst.timer) pause(inst); else play(inst); }
  function reset(inst) {
    pause(inst);
    CHANNELS.forEach(function (c) { inst.results[c] = { status: "idle", attempts: 0 }; });
    inst.dedup = {}; inst.seq = 0; inst.lastKey = null;
    inst.sent = 0; inst.failed = 0; inst.retried = 0; inst.deduped = 0; inst.skipped = 0;
    inst.lastDecision = "Reset."; render(inst);
  }

  function render(inst) {
    var c = inst.container;
    CHANNELS.forEach(function (ch) {
      var r = inst.results[ch];
      var st = c.querySelector('[data-status="' + ch + '"]');
      var sub = c.querySelector('[data-sub="' + ch + '"]');
      var label = r.status === "sent" ? "SENT" : r.status === "failed" ? "FAILED" : r.status === "skipped" ? "SKIPPED (opt-out)" : r.status === "deduped" ? "DEDUPED" : "idle";
      var cls = r.status === "sent" ? "is-sent" : r.status === "failed" ? "is-failed" : r.status === "skipped" || r.status === "deduped" ? "is-skipped" : "";
      st.textContent = label; st.className = "ntv-status " + cls;
      sub.textContent = r.attempts > 1 ? r.attempts + " attempts" : r.attempts === 1 ? "1 attempt" : "";
    });

    var ui = parseInt(c.querySelector(".ntv-user").value, 10);
    var u = USERS[ui];
    c.querySelector("[data-prefs]").innerHTML = "<span>Preferences for <b>" + u.name + "</b>:</span>" +
      CHANNELS.map(function (ch) { return '<span class="ntv-pill ' + (u.prefs[ch] ? "on" : "off") + '">' + CH_LABEL[ch] + (u.prefs[ch] ? " on" : " off") + "</span>"; }).join("");

    var cap = c.querySelector(".ntv-caption");
    cap.textContent = inst.lastDecision;
    cap.className = "ntv-caption" + (inst.bad ? " is-bad" : "");

    setMetric(c, "sent", inst.sent);
    setMetric(c, "failed", inst.failed);
    setMetric(c, "retried", inst.retried);
    setMetric(c, "deduped", inst.deduped);
    setMetric(c, "skipped", inst.skipped);

    if (inst.lens && !inst._traced) {
      inst.lens.setActive(["NotificationService", "ChannelAdapter"]);
      inst.lens.setTrace([{ cls: "NotificationService", method: "send" }]);
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
        { id: "Notification", label: "Notification", stereotype: "class", x: 150, y: 90, owns: "One event to deliver.", fields: ["id", "type", "recipient", "payload", "idempotencyKey"] },
        { id: "Recipient", label: "Recipient", stereotype: "class", x: 150, y: 260, owns: "The user.", fields: ["id", "name"] },
        { id: "UserPreferences", label: "UserPreferences", stereotype: "class", x: 150, y: 430, owns: "Eligible channels for a recipient/type.", methods: ["eligible(type)"] },
        { id: "Template", label: "Template", stereotype: "class", x: 150, y: 600, owns: "Content per type/channel.", fields: ["type", "channel", "body"] },
        { id: "NotificationService", label: "NotificationService", stereotype: "class", x: 450, y: 110,
          owns: "Orchestrates: dedup → preferences → render → send → retry.",
          fields: ["adapters", "preferences", "templates", "retryPolicy", "dedup"],
          methods: ["send(notification)", "retry(attempt)"] },
        { id: "TemplateEngine", label: "TemplateEngine", stereotype: "interface", x: 450, y: 300, owns: "Renders content per channel.", methods: ["render(type,payload,channel)"] },
        { id: "RetryPolicy", label: "RetryPolicy", stereotype: "interface", x: 450, y: 470, owns: "Whether/how to retry.", methods: ["shouldRetry(attempt)", "backoff(attempt)"] },
        { id: "DeduplicationStore", label: "DeduplicationStore", stereotype: "class", x: 450, y: 640, owns: "Idempotency keys.", methods: ["seen(key)", "mark(key)"] },
        { id: "ChannelAdapter", label: "ChannelAdapter", stereotype: "interface", x: 760, y: 90, owns: "Sends via one provider.", methods: ["send(recipient,content,key)"] },
        { id: "EmailChannel", label: "EmailChannel", stereotype: "class", x: 760, y: 260, owns: "Email provider.", methods: ["send()"] },
        { id: "SmsChannel", label: "SmsChannel", stereotype: "class", x: 760, y: 430, owns: "SMS provider.", methods: ["send()"] },
        { id: "PushChannel", label: "PushChannel", stereotype: "class", x: 760, y: 600, owns: "Push provider.", methods: ["send()"] },
      ],
      edges: [
        { from: "Notification", to: "Recipient", kind: "association" },
        { from: "NotificationService", to: "DeduplicationStore", kind: "depends" },
        { from: "NotificationService", to: "UserPreferences", kind: "depends" },
        { from: "NotificationService", to: "TemplateEngine", kind: "depends" },
        { from: "NotificationService", to: "RetryPolicy", kind: "depends" },
        { from: "NotificationService", to: "ChannelAdapter", kind: "aggregation" },
        { from: "TemplateEngine", to: "Template", kind: "depends" },
        { from: "EmailChannel", to: "ChannelAdapter", kind: "implements" },
        { from: "SmsChannel", to: "ChannelAdapter", kind: "implements" },
        { from: "PushChannel", to: "ChannelAdapter", kind: "implements" },
      ],
      patterns: [
        { id: "strategy", label: "Strategy", classes: ["ChannelAdapter", "EmailChannel", "SmsChannel", "PushChannel"],
          note: "Each channel is an adapter behind one interface. Add a channel (WhatsApp, in-app) without touching NotificationService." },
        { id: "chain", label: "Policy chain", classes: ["NotificationService", "DeduplicationStore", "UserPreferences", "TemplateEngine"],
          note: "The send path is a chain of policy steps: dedup → eligible channels → render → send. Each step can reject the notification early." },
      ],
      strategyGroups: [
        { id: "channels", label: "Channel policy", options: [
            { id: "respect", label: "Respect preferences", note: "Only opted-in channels are used. This is the invariant: a user never gets a channel they turned off." },
            { id: "force", label: "Ignore preferences", note: "Unsafe: force all channels. Included to show what the invariant prevents — opted-out users get messages." },
          ], default: "respect", classMap: { respect: "UserPreferences", force: "UserPreferences" },
          onChange: function (id) { inst.strategy.channelPolicy = id; inst.lastDecision = "Channel policy = " + id + "."; render(inst); } },
        { id: "retry", label: "RetryPolicy", options: [
            { id: "exponential", label: "Retry ×2", note: "On provider failure, retry up to twice with backoff (idempotency key prevents double delivery)." },
            { id: "none", label: "No retry", note: "Fail fast and let a dead-letter queue handle it later." },
          ], default: "exponential", classMap: { exponential: "RetryPolicy", none: "RetryPolicy" },
          onChange: function (id) { inst.strategy.retry = id; inst.lastDecision = "RetryPolicy = " + id + "."; render(inst); } },
      ],
      interviewLabel: "8-phase path",
      interview: [
        { n: 1, label: "Requirements / Use Cases", classes: ["Notification", "Recipient"], note: "Channels, preferences, templates, retries, dedup, provider limits." },
        { n: 2, label: "Core Entities", classes: ["ChannelAdapter", "TemplateEngine", "UserPreferences"], note: "Nouns: notification, recipient, preferences, template, adapter, attempt." },
        { n: 3, label: "Responsibilities", classes: ["NotificationService", "ChannelAdapter"], note: "Service orchestrates; adapter sends one channel; preferences decide eligibility." },
        { n: 4, label: "Relationships + Interfaces", classes: ["ChannelAdapter", "TemplateEngine", "RetryPolicy"], note: "Has-a for collaborators; interfaces at channel, render, and retry." },
        { n: 5, label: "Class Diagram", classes: ["NotificationService", "ChannelAdapter", "DeduplicationStore"], note: "The orchestration plus the adapter hierarchy and dedup store." },
        { n: 6, label: "Core Flows", classes: ["NotificationService", "UserPreferences"], note: "Send: dedup → eligible → render → send; retry loop on failure." },
        { n: 7, label: "Critical Code", classes: ["NotificationService", "DeduplicationStore"], note: "The idempotent dedup check and the bounded retry loop carry correctness." },
        { n: 8, label: "Edge Cases + Extensibility", classes: ["RetryPolicy", "ChannelAdapter"], note: "Provider down, duplicate event, opt-out, quiet hours; new channel = new adapter." },
      ],
    };
  }

  function initialize() {
    document.querySelectorAll(".notification-visualizer").forEach(function (container) {
      if (container.dataset.initialized === "true") return;
      container.dataset.initialized = "true";
      build(container);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
